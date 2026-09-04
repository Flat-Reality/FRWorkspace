import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const STATE_ID = 'workspace';
const SESSION_DAYS = 90;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type WorkspaceMember = {
  id: string;
  employmentId: string;
  passwordHash?: string;
  isAdmin?: boolean;
  preferredName?: string;
  phoneNumber?: string;
  timeZone?: string;
  portfolio?: string;
  upworkUrl?: string;
};

type WorkspaceState = {
  members: WorkspaceMember[];
  levels: unknown[];
  rewards: unknown[];
  guidePages: unknown[];
  workRecords: Array<Record<string, unknown> & { id: string; memberId: string; type: string; explanationText?: string; explanationSubmittedAt?: string }>;
  scheduleShifts: Array<Record<string, unknown> & { memberId: string }>;
  scheduleCompletions: Array<Record<string, unknown> & { memberId: string }>;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string) {
  const iterations = 210000;
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

async function verifyPassword(password: string, storedHash: string) {
  if (storedHash.startsWith('pbkdf2$')) {
    const [, iterationsValue, saltValue, hashValue] = storedHash.split('$');
    const iterations = Number(iterationsValue);
    if (!iterations || !saltValue || !hashValue) return { ok: false, needsUpgrade: false };
    const salt = base64ToBytes(saltValue);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return { ok: timingSafeEqual(bytesToBase64(new Uint8Array(bits)), hashValue), needsUpgrade: false };
  }

  return { ok: timingSafeEqual(await sha256Hex(password), storedHash), needsUpgrade: true };
}

async function loadState(): Promise<WorkspaceState> {
  const { data, error } = await supabase.from('workspace_state').select('state').eq('id', STATE_ID).maybeSingle();
  if (error || !data?.state) throw new Error('Workspace state was not found.');
  return data.state as WorkspaceState;
}

function scrubState(state: WorkspaceState, actor: WorkspaceMember): WorkspaceState {
  const isAdmin = Boolean(actor.isAdmin);
  const visibleMemberIds = new Set(isAdmin ? state.members.map((member) => member.id) : [actor.id]);
  return {
    ...state,
    members: state.members.filter((member) => visibleMemberIds.has(member.id)).map((member) => ({ ...member, passwordHash: '' })),
    workRecords: state.workRecords.filter((record) => visibleMemberIds.has(record.memberId)),
    scheduleShifts: state.scheduleShifts.filter((shift) => visibleMemberIds.has(shift.memberId)),
    scheduleCompletions: state.scheduleCompletions.filter((completion) => visibleMemberIds.has(completion.memberId)),
  };
}

async function getCredential(member: WorkspaceMember) {
  const { data, error } = await supabase.from('workspace_credentials').select('password_hash').eq('member_id', member.id).maybeSingle();
  if (error && error.code !== '42P01') throw error;
  return data?.password_hash || member.passwordHash || '';
}

async function setCredential(member: WorkspaceMember, passwordHash: string) {
  const { error } = await supabase.from('workspace_credentials').upsert({
    member_id: member.id,
    employment_id: member.employmentId,
    password_hash: passwordHash,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

async function createSession(member: WorkspaceMember) {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase.from('workspace_sessions').insert({ token_hash: tokenHash, member_id: member.id, expires_at: expiresAt });
  if (error) throw error;
  return { token, memberId: member.id, expiresAt };
}

async function actorFromToken(token: string) {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase.from('workspace_sessions').select('member_id, expires_at').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at) < new Date()) return null;
  const state = await loadState();
  const actor = state.members.find((member) => member.id === data.member_id);
  return actor ? { actor, state } : null;
}

function mergeUserState(previous: WorkspaceState, requested: WorkspaceState, actor: WorkspaceMember) {
  const allowedMemberFields = new Set(['preferredName', 'phoneNumber', 'timeZone', 'portfolio', 'upworkUrl']);
  const requestedActor = requested.members.find((member) => member.id === actor.id);
  const previousActor = previous.members.find((member) => member.id === actor.id);
  if (!requestedActor || !previousActor) return previous;

  const nextActor = { ...previousActor };
  allowedMemberFields.forEach((field) => {
    if (field in requestedActor) (nextActor as Record<string, unknown>)[field] = (requestedActor as Record<string, unknown>)[field];
  });

  const requestedRecords = new Map(requested.workRecords.filter((record) => record.memberId === actor.id).map((record) => [record.id, record]));
  const workRecords = previous.workRecords.map((record) => {
    if (record.memberId !== actor.id || record.type !== 'explanation_request') return record;
    const requestedRecord = requestedRecords.get(record.id);
    if (!requestedRecord?.explanationText) return record;
    return {
      ...record,
      explanationText: String(requestedRecord.explanationText),
      explanationSubmittedAt: String(requestedRecord.explanationSubmittedAt || new Date().toISOString()),
    };
  });

  const scheduleShifts = [
    ...previous.scheduleShifts.filter((shift) => shift.memberId !== actor.id),
    ...requested.scheduleShifts.filter((shift) => shift.memberId === actor.id),
  ];
  const scheduleCompletions = [
    ...previous.scheduleCompletions.filter((completion) => completion.memberId !== actor.id),
    ...requested.scheduleCompletions.filter((completion) => completion.memberId === actor.id),
  ];

  return {
    ...previous,
    members: previous.members.map((member) => (member.id === actor.id ? nextActor : member)),
    workRecords,
    scheduleShifts,
    scheduleCompletions,
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const action = String(body.action ?? '');

    if (action === 'login') {
      const state = await loadState();
      const employmentId = String(body.employmentId ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const member = state.members.find((item) => item.employmentId.toLowerCase() === employmentId);
      if (!member) return json({ error: 'Employment ID or password is incorrect.' }, 401);
      const storedHash = await getCredential(member);
      if (!storedHash) return json({ error: 'Password is not set. Use recovery options to create one.' }, 401);
      const passwordCheck = await verifyPassword(password, storedHash);
      if (!passwordCheck.ok) return json({ error: 'Employment ID or password is incorrect.' }, 401);
      if (passwordCheck.needsUpgrade) await setCredential(member, await hashPassword(password));
      const session = await createSession(member);
      return json({ session, state: scrubState(state, member) });
    }

    if (action === 'recovery_options') {
      const state = await loadState();
      const employmentId = String(body.employmentId ?? '').trim().toLowerCase();
      const member = state.members.find((item) => item.employmentId.toLowerCase() === employmentId);
      if (!member || (await getCredential(member))) {
        return json({ error: 'Recovery wizard cannot be used with these details. Contact your manager for manual recovery.' }, 403);
      }
      return json({ ok: true });
    }

    if (action === 'recover') {
      const state = await loadState();
      const employmentId = String(body.employmentId ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const member = state.members.find((item) => item.employmentId.toLowerCase() === employmentId);
      if (!member || (await getCredential(member))) {
        return json({ error: 'Recovery wizard cannot be used with these details. Contact your manager for manual recovery.' }, 403);
      }
      if (password.length < 10) return json({ error: 'Password must contain at least 10 characters.' }, 400);
      await setCredential(member, await hashPassword(password));
      return json({ ok: true });
    }

    const context = await actorFromToken(String(body.sessionToken ?? ''));
    if (!context) return json({ error: 'Session is invalid or expired.' }, 401);

    if (action === 'load') return json({ state: scrubState(context.state, context.actor) });

    if (action === 'reset_password') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const memberId = String(body.memberId ?? '');
      await supabase.from('workspace_credentials').delete().eq('member_id', memberId);
      return json({ ok: true });
    }

    if (action === 'impersonate') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const memberId = String(body.memberId ?? '');
      const target = context.state.members.find((member) => member.id === memberId);
      if (!target) return json({ error: 'User was not found.' }, 404);
      const session = await createSession(target);
      return json({ session, state: scrubState(context.state, target) });
    }

    if (action === 'save') {
      const requestedState = body.state as WorkspaceState;
      const nextState = context.actor.isAdmin ? requestedState : mergeUserState(context.state, requestedState, context.actor);
      nextState.members = nextState.members.map((member) => ({ ...member, passwordHash: '' }));
      const { error } = await supabase.from('workspace_state').upsert({ id: STATE_ID, state: nextState, updated_at: new Date().toISOString() });
      if (error) throw error;
      return json({ state: scrubState(nextState, context.actor) });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
