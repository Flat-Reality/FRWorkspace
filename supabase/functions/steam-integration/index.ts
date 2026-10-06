import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/steam-integration/callback`;
const DEFAULT_RETURN_URL = 'https://flat-reality.github.io/FRWorkspace/';
const STEAM_OPENID_URL = 'https://steamcommunity.com/openid/login';
const OPENID_NS = 'http://specs.openid.net/auth/2.0';
const OPENID_IDENTIFIER = `${OPENID_NS}/identifier_select`;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

type WorkspaceMember = {
  id: string;
  employmentId: string;
  preferredName?: string;
  fullName?: string;
  steamConnected?: boolean;
  steamId?: string;
  steamProfileUrl?: string;
  isAdmin?: boolean;
};

type WorkspaceState = { members: WorkspaceMember[] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function base64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function allowedReturnUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.hostname === 'localhost') return true;
    return url.protocol === 'https:' && (url.hostname === 'workspace.flatreality.eu' || url.hostname === 'flat-reality.github.io');
  } catch {
    return false;
  }
}

function displayName(member: WorkspaceMember) {
  return member.preferredName?.trim() || member.fullName?.trim() || member.employmentId;
}

async function loadState(): Promise<WorkspaceState> {
  const { data, error } = await supabase.from('workspace_state').select('state').eq('id', 'workspace').single();
  if (error || !data?.state) throw new Error('Workspace state was not found.');
  return data.state as WorkspaceState;
}

async function saveState(state: WorkspaceState) {
  const { error } = await supabase.from('workspace_state').upsert({ id: 'workspace', state, updated_at: new Date().toISOString() });
  if (error) throw error;
}

async function actorFromToken(token: string) {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase.from('workspace_sessions').select('member_id, expires_at').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  if (!data || new Date(data.expires_at) <= new Date()) return null;
  const state = await loadState();
  const actor = state.members.find((member) => member.id === data.member_id);
  return actor ? { actor, state } : null;
}

async function audit(eventType: string, actor: WorkspaceMember, summary: string, payload: Record<string, unknown> = {}) {
  await supabase.from('workspace_audit_log').insert({
    event_type: eventType,
    actor_member_id: actor.id,
    event_payload: { ...payload, actorName: displayName(actor), targetMemberId: actor.id, targetName: displayName(actor), summary },
  });
}

async function snapshot(memberId: string) {
  const { data, error } = await supabase.from('workspace_steam_connections').select('*').eq('member_id', memberId).maybeSingle();
  if (error) throw error;
  if (!data) return { connected: false, steamId: '', profileUrl: '', packageStatus: 'not_connected', connectedAt: '' };
  return {
    connected: true,
    steamId: data.steam_id,
    profileUrl: data.profile_url,
    packageStatus: data.package_status,
    connectedAt: data.connected_at,
  };
}

async function verifySteamResponse(url: URL) {
  const verification = new URLSearchParams();
  for (const [key, value] of url.searchParams.entries()) {
    if (key.startsWith('openid.')) verification.set(key, value);
  }
  verification.set('openid.mode', 'check_authentication');
  const response = await fetch(STEAM_OPENID_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: verification,
  });
  const result = await response.text();
  if (!response.ok || !/(?:^|\n)is_valid:true(?:\n|$)/.test(result)) throw new Error('Steam could not verify this identity. Please try again.');
  const claimedId = url.searchParams.get('openid.claimed_id') ?? '';
  const match = claimedId.match(/^https?:\/\/steamcommunity\.com\/openid\/id\/(\d+)$/);
  if (!match) throw new Error('Steam returned an invalid identity.');
  return match[1];
}

async function callback(url: URL) {
  const stateValue = url.searchParams.get('state') ?? '';
  const stateHash = stateValue ? await sha256Hex(stateValue) : '';
  const { data: openidState } = stateHash
    ? await supabase.from('workspace_steam_openid_states').select('*').eq('state_hash', stateHash).maybeSingle()
    : { data: null };
  if (stateHash) await supabase.from('workspace_steam_openid_states').delete().eq('state_hash', stateHash);
  const returnUrl = openidState?.return_url && allowedReturnUrl(openidState.return_url) ? openidState.return_url : DEFAULT_RETURN_URL;
  const redirect = new URL(returnUrl);

  try {
    if (!openidState || new Date(openidState.expires_at) <= new Date()) throw new Error('Steam connection request expired. Please try again.');
    const steamId = await verifySteamResponse(url);
    const profileUrl = `https://steamcommunity.com/profiles/${steamId}`;
    const state = await loadState();
    const member = state.members.find((item) => item.id === openidState.member_id);
    if (!member) throw new Error('Workspace profile was not found.');
    const { error } = await supabase.from('workspace_steam_connections').upsert({
      member_id: member.id,
      steam_id: steamId,
      profile_url: profileUrl,
      package_status: 'pending_admin',
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    const nextMember = { ...member, steamConnected: true, steamId, steamProfileUrl: profileUrl };
    await saveState({ ...state, members: state.members.map((item) => item.id === member.id ? nextMember : item) });
    await audit('identity.steam_linked', nextMember, `${displayName(nextMember)} linked Steam identity ${steamId}.`, { steamId, packageStatus: 'pending_admin' });
    redirect.searchParams.set('steam', 'connected');
  } catch (error) {
    redirect.searchParams.set('steam_error', error instanceof Error ? error.message : 'Steam connection failed.');
  }
  return Response.redirect(redirect.toString(), 302);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/callback')) return callback(url);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const context = await actorFromToken(String(body.sessionToken ?? ''));
    if (!context) return json({ error: 'Session is invalid or expired.' }, 401);
    const action = String(body.action ?? '');
    const targetId = String(body.memberId ?? context.actor.id);
    if (targetId !== context.actor.id && !context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
    const target = context.state.members.find((member) => member.id === targetId);
    if (!target) return json({ error: 'Workspace profile was not found.' }, 404);

    if (action === 'connect') {
      const returnUrl = String(body.returnUrl ?? DEFAULT_RETURN_URL);
      if (!allowedReturnUrl(returnUrl)) return json({ error: 'Return URL is not allowed.' }, 400);
      const stateValue = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      await supabase.from('workspace_steam_openid_states').delete().lt('expires_at', new Date().toISOString());
      const { error } = await supabase.from('workspace_steam_openid_states').insert({
        state_hash: await sha256Hex(stateValue),
        member_id: context.actor.id,
        return_url: returnUrl,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw error;
      const authorizationUrl = new URL(STEAM_OPENID_URL);
      authorizationUrl.searchParams.set('openid.ns', OPENID_NS);
      authorizationUrl.searchParams.set('openid.mode', 'checkid_setup');
      authorizationUrl.searchParams.set('openid.return_to', `${CALLBACK_URL}?state=${encodeURIComponent(stateValue)}`);
      authorizationUrl.searchParams.set('openid.realm', `${SUPABASE_URL}/`);
      authorizationUrl.searchParams.set('openid.identity', OPENID_IDENTIFIER);
      authorizationUrl.searchParams.set('openid.claimed_id', OPENID_IDENTIFIER);
      return json({ authorizationUrl: authorizationUrl.toString() });
    }

    if (action === 'snapshot') return json({ snapshot: await snapshot(target.id) });

    if (action === 'disconnect') {
      await supabase.from('workspace_steam_connections').delete().eq('member_id', target.id);
      const nextMember = { ...target, steamConnected: false, steamId: '', steamProfileUrl: '' };
      await saveState({ ...context.state, members: context.state.members.map((member) => member.id === target.id ? nextMember : member) });
      await audit('identity.steam_disconnected', context.actor, `Steam was disconnected from ${displayName(target)}.`, { targetMemberId: target.id });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected Steam integration error.' }, 500);
  }
});
