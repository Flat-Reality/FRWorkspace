import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const STATE_ID = 'workspace';
const SESSION_DAYS = 90;
const AUDIT_RETENTION_DAYS = 90;

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
  lastSeenAt?: string;
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

type AuditEvent = {
  eventType: string;
  actor?: WorkspaceMember | null;
  target?: WorkspaceMember | null;
  summary: string;
  payload?: Record<string, unknown>;
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

function displayName(member?: WorkspaceMember | null) {
  return member?.preferredName?.trim() || member?.employmentId || member?.id || 'System';
}

async function writeAuditLog({ eventType, actor, target, summary, payload = {} }: AuditEvent) {
  const now = new Date();
  await supabase.from('workspace_audit_log').insert({
    event_type: eventType,
    actor_member_id: actor?.id ?? null,
    event_payload: {
      ...payload,
      actorName: displayName(actor),
      targetMemberId: target?.id,
      targetName: target ? displayName(target) : undefined,
      summary,
    },
  });

  const cutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('workspace_audit_log').delete().lt('created_at', cutoff);
}

function compactValue(value: unknown) {
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 77)}...` : value;
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  return '[complex value]';
}

function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>) {
  const ignored = new Set(['passwordHash', 'lastSeenAt']);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !ignored.has(key) && JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function diffCollection<T extends Record<string, unknown> & { id: string }>(name: string, before: T[] = [], after: T[] = [], actor: WorkspaceMember, members: WorkspaceMember[]) {
  const beforeMap = new Map(before.map((item) => [item.id, item]));
  const afterMap = new Map(after.map((item) => [item.id, item]));
  const events: AuditEvent[] = [];

  afterMap.forEach((item, id) => {
    const previous = beforeMap.get(id);
    const target = members.find((member) => member.id === item.memberId || member.id === item.id);
    if (!previous) {
      events.push({ eventType: `${name}.created`, actor, target, summary: `${name} created${target ? ` for ${displayName(target)}` : ''}.`, payload: { itemId: id, item } });
      return;
    }
    const keys = changedKeys(previous, item);
    if (keys.length) {
      events.push({
        eventType: `${name}.updated`,
        actor,
        target,
        summary: `${name} updated${target ? ` for ${displayName(target)}` : ''}: ${keys.join(', ')}.`,
        payload: {
          itemId: id,
          changes: Object.fromEntries(keys.map((key) => [key, { from: compactValue(previous[key]), to: compactValue(item[key]) }])),
        },
      });
    }
  });

  beforeMap.forEach((item, id) => {
    if (!afterMap.has(id)) {
      const target = members.find((member) => member.id === item.memberId || member.id === item.id);
      events.push({ eventType: `${name}.deleted`, actor, target, summary: `${name} deleted${target ? ` for ${displayName(target)}` : ''}.`, payload: { itemId: id } });
    }
  });

  return events;
}

async function auditStateChanges(before: WorkspaceState, after: WorkspaceState, actor: WorkspaceMember) {
  const events = [
    ...diffCollection('member', before.members, after.members, actor, after.members),
    ...diffCollection('work_record', before.workRecords, after.workRecords, actor, after.members),
    ...diffCollection('guide_page', before.guidePages as Array<Record<string, unknown> & { id: string }>, after.guidePages as Array<Record<string, unknown> & { id: string }>, actor, after.members),
    ...diffCollection('level', before.levels as Array<Record<string, unknown> & { id: string }>, after.levels as Array<Record<string, unknown> & { id: string }>, actor, after.members),
    ...diffCollection('reward', before.rewards as Array<Record<string, unknown> & { id: string }>, after.rewards as Array<Record<string, unknown> & { id: string }>, actor, after.members),
    ...diffCollection('schedule_shift', before.scheduleShifts, after.scheduleShifts, actor, after.members),
    ...diffCollection('schedule_completion', before.scheduleCompletions, after.scheduleCompletions, actor, after.members),
  ];

  for (const event of events.slice(0, 50)) await writeAuditLog(event);
  if (events.length > 50) {
    await writeAuditLog({ eventType: 'workspace.bulk_change', actor, summary: `Workspace save included ${events.length} changes. Showing first 50 individually.`, payload: { changeCount: events.length } });
  }
}

async function touchMemberLastSeen(state: WorkspaceState, memberId: string) {
  const now = new Date().toISOString();
  const nextState = {
    ...state,
    members: state.members.map((member) => (member.id === memberId ? { ...member, lastSeenAt: now } : member)),
  };
  const { error } = await supabase.from('workspace_state').upsert({ id: STATE_ID, state: nextState, updated_at: now });
  if (error) throw error;
  return nextState;
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
      let state = await loadState();
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
      state = await touchMemberLastSeen(state, member.id);
      await writeAuditLog({ eventType: 'session.login', actor: member, target: member, summary: `${displayName(member)} signed in.` });
      return json({ session, state: scrubState(state, { ...member, lastSeenAt: new Date().toISOString() }) });
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

    if (action === 'load') {
      const state = await touchMemberLastSeen(context.state, context.actor.id);
      const actor = state.members.find((member) => member.id === context.actor.id) ?? context.actor;
      return json({ state: scrubState(state, actor) });
    }

    if (action === 'reset_password') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const memberId = String(body.memberId ?? '');
      await supabase.from('workspace_credentials').delete().eq('member_id', memberId);
      const target = context.state.members.find((member) => member.id === memberId);
      await writeAuditLog({ eventType: 'credential.reset', actor: context.actor, target, summary: `${displayName(context.actor)} reset password for ${displayName(target)}.` });
      return json({ ok: true });
    }

    if (action === 'impersonate') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const memberId = String(body.memberId ?? '');
      const target = context.state.members.find((member) => member.id === memberId);
      if (!target) return json({ error: 'User was not found.' }, 404);
      const session = await createSession(target);
      const state = await touchMemberLastSeen(context.state, target.id);
      await writeAuditLog({ eventType: 'session.impersonate', actor: context.actor, target, summary: `${displayName(context.actor)} signed in as ${displayName(target)}.` });
      return json({ session, state: scrubState(state, target) });
    }

    if (action === 'list_logs') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const limit = Math.min(Number(body.limit ?? 200) || 200, 500);
      const { data, error } = await supabase
        .from('workspace_audit_log')
        .select('id, event_type, actor_member_id, event_payload, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return json({
        logs: (data ?? []).map((row) => ({
          id: row.id,
          eventType: row.event_type,
          actorMemberId: row.actor_member_id,
          actorName: row.event_payload?.actorName ?? 'System',
          targetMemberId: row.event_payload?.targetMemberId,
          targetName: row.event_payload?.targetName,
          summary: row.event_payload?.summary ?? row.event_type,
          payload: row.event_payload ?? {},
          createdAt: row.created_at,
        })),
      });
    }

    if (action === 'save') {
      const requestedState = body.state as WorkspaceState;
      const nextState = context.actor.isAdmin ? requestedState : mergeUserState(context.state, requestedState, context.actor);
      nextState.members = nextState.members.map((member) => ({ ...member, passwordHash: '' }));
      const { error } = await supabase.from('workspace_state').upsert({ id: STATE_ID, state: nextState, updated_at: new Date().toISOString() });
      if (error) throw error;
      await auditStateChanges(context.state, nextState, context.actor);
      return json({ state: scrubState(nextState, context.actor) });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
