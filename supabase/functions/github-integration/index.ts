import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/github-integration/callback`;
const DEFAULT_RETURN_URL = 'https://flat-reality.github.io/FRWorkspace/';
const GITHUB_API = 'https://api.github.com';
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
  benefitPrograms?: string[];
  contractType?: string;
  permissions?: string[];
  permissionDetails?: string[];
  githubConnected?: boolean;
  githubUsername?: string;
  githubUserId?: string;
  githubAvatarUrl?: string;
  githubProfileUrl?: string;
  isAdmin?: boolean;
};

type WorkspaceState = { members: WorkspaceMember[] };
type ActorContext = { actor: WorkspaceMember; state: WorkspaceState };
type GitHubSecrets = {
  github_app_id?: string;
  github_client_id?: string;
  github_client_secret?: string;
  github_private_key?: string;
  github_organization?: string;
};

type AccessGroup = {
  group_key: string;
  display_name: string;
  github_team_slug: string;
};

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

async function actorFromToken(token: string): Promise<ActorContext | null> {
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

async function getSecrets() {
  const { data, error } = await supabase.rpc('get_github_runtime_secrets');
  if (error) throw error;
  return (data ?? {}) as GitHubSecrets;
}

function derLength(length: number) {
  if (length < 128) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function der(tag: number, value: Uint8Array) {
  return new Uint8Array([tag, ...derLength(value.length), ...value]);
}

function pemBytes(value: string) {
  const pkcs1 = value.includes('BEGIN RSA PRIVATE KEY');
  const normalized = value.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\s/g, '');
  const key = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
  if (!pkcs1) return key;
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const rsaAlgorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  return der(0x30, new Uint8Array([...version, ...rsaAlgorithm, ...der(0x04, key)]));
}

async function appJwt() {
  const secrets = await getSecrets();
  if (!secrets.github_app_id || !secrets.github_private_key) throw new Error('GitHub App credentials are not configured.');
  const key = await crypto.subtle.importKey('pkcs8', pemBytes(secrets.github_private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64Url(new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: secrets.github_app_id })));
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(input));
  return `${input}.${base64Url(new Uint8Array(signature))}`;
}

async function githubRequest<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (response.status === 204) return null as T;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message || `GitHub returned ${response.status}.`);
  return payload as T;
}

async function installationId() {
  const secrets = await getSecrets();
  const organization = secrets.github_organization || 'Flat-Reality';
  const { data } = await supabase.from('workspace_github_installations').select('installation_id').eq('organization_login', organization).maybeSingle();
  if (data?.installation_id) return Number(data.installation_id);

  const installations = await githubRequest<Array<{ id: number; account?: { id?: number; login?: string }; repository_selection?: string; suspended_at?: string | null }>>('/app/installations', await appJwt());
  const installation = installations.find((item) => item.account?.login?.toLowerCase() === organization.toLowerCase());
  if (!installation) throw new Error('Install Flat Reality Workspace GitHub App on the Flat-Reality organization first.');
  await supabase.from('workspace_github_installations').upsert({
    organization_login: organization,
    installation_id: installation.id,
    account_id: installation.account?.id ?? null,
    repository_selection: installation.repository_selection ?? '',
    suspended_at: installation.suspended_at ?? null,
    updated_at: new Date().toISOString(),
  });
  return installation.id;
}

async function installationToken() {
  const payload = await githubRequest<{ token: string }>(`/app/installations/${await installationId()}/access_tokens`, await appJwt(), { method: 'POST', body: '{}' });
  return payload.token;
}

async function loadAccessGroups(): Promise<AccessGroup[]> {
  const { data, error } = await supabase.from('workspace_access_groups').select('group_key, display_name, github_team_slug').order('display_name');
  if (error) throw error;
  return (data ?? []) as AccessGroup[];
}

function desiredAccessGroupKeys(member: WorkspaceMember) {
  const keys = new Set<string>();
  if (member.contractType === 'CORE TEAM') keys.add('core_team');
  if (member.contractType === 'INDEPENDENT PARTNER') keys.add('independent_partner');
  const permissions = new Set(member.permissions ?? []);
  if (member.isAdmin || permissions.has('Admin')) keys.add('administration');
  if (permissions.has('Community')) keys.add('community');
  if (permissions.has('Developer')) keys.add('developers');
  if (permissions.has('HR')) keys.add('hr');
  if (permissions.has('Operations')) keys.add('operations');
  const details = new Set(member.permissionDetails ?? []);
  if (details.has('Art')) keys.add('creative_artists');
  if (details.has('Music') || details.has('Sound Design')) keys.add('creative_audio');
  if (details.has('Game & Level Design')) keys.add('creative_game_designers');
  const projects = new Set(member.benefitPrograms ?? []);
  if (projects.has('FR Partners')) keys.add('project_partners');
  if (projects.has('RAIN HEART')) keys.add('project_rain_heart');
  if (projects.has('The Nick')) keys.add('project_the_nick');
  return keys;
}

async function ensureAccessTeams(token: string, organization: string) {
  const groups = await loadAccessGroups();
  const teams = await githubRequest<Array<{ name: string; slug: string }>>(`/orgs/${encodeURIComponent(organization)}/teams?per_page=100`, token);
  const resolved: AccessGroup[] = [];
  for (const group of groups) {
    let team = teams.find((item) => item.slug === group.github_team_slug)
      ?? teams.find((item) => item.name.toLocaleLowerCase() === group.display_name.toLocaleLowerCase());
    if (!team) {
      team = await githubRequest<{ name: string; slug: string }>(`/orgs/${encodeURIComponent(organization)}/teams`, token, {
        method: 'POST',
        body: JSON.stringify({ name: group.display_name, privacy: 'closed' }),
      });
      teams.push(team);
    } else if (team.name !== group.display_name) {
      team = await githubRequest<{ name: string; slug: string }>(`/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(team.slug)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ name: group.display_name, privacy: 'closed' }),
      });
    }
    if (team.slug !== group.github_team_slug) {
      await supabase.from('workspace_access_groups').update({ github_team_slug: team.slug, updated_at: new Date().toISOString() }).eq('group_key', group.group_key);
    }
    resolved.push({ ...group, github_team_slug: team.slug });
  }
  return resolved;
}

async function synchronizeAccess(member: WorkspaceMember, profile: { id: number; login: string; html_url?: string; avatar_url?: string; email?: string }) {
  const secrets = await getSecrets();
  const organization = secrets.github_organization || 'Flat-Reality';
  const token = await installationToken();
  let membership: { state?: string; role?: string };
  try {
    membership = await githubRequest<{ state?: string; role?: string }>(`/orgs/${encodeURIComponent(organization)}/memberships/${encodeURIComponent(profile.login)}`, token);
  } catch {
    membership = await githubRequest<{ state?: string; role?: string }>(`/orgs/${encodeURIComponent(organization)}/memberships/${encodeURIComponent(profile.login)}`, token, {
      method: 'PUT',
      body: JSON.stringify({ role: 'member' }),
    });
  }
  const membershipState = membership.state === 'active' ? 'active' : 'pending';
  const groups = await ensureAccessTeams(token, organization);
  const desiredKeys = desiredAccessGroupKeys(member);
  const teamSlugs = groups.filter((group) => desiredKeys.has(group.group_key)).map((group) => group.github_team_slug);
  const warnings: string[] = [];

  if (membershipState === 'active') {
    for (const group of groups) {
      const shouldBeMember = desiredKeys.has(group.group_key);
      try {
        if (shouldBeMember) {
          await githubRequest(`/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(group.github_team_slug)}/memberships/${encodeURIComponent(profile.login)}`, token, {
            method: 'PUT',
            body: JSON.stringify({ role: 'member' }),
          });
        } else {
          await githubRequest(`/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(group.github_team_slug)}/memberships/${encodeURIComponent(profile.login)}`, token, { method: 'DELETE' }).catch((error) => {
            if (error instanceof Error && /not found/i.test(error.message)) return null;
            throw error;
          });
        }
      } catch (error) {
        warnings.push(`${group.display_name}: ${error instanceof Error ? error.message : 'Team access could not be synchronized.'}`);
      }
    }
  }

  const { error } = await supabase.from('workspace_github_connections').upsert({
    member_id: member.id,
    github_user_id: profile.id,
    github_username: profile.login,
    profile_url: profile.html_url ?? `https://github.com/${profile.login}`,
    avatar_url: profile.avatar_url ?? '',
    email: profile.email ?? '',
    membership_state: warnings.length ? 'error' : membershipState,
    team_slugs: membershipState === 'active' ? teamSlugs : [],
    sync_error: warnings.join(' | '),
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { membershipState, teamSlugs: membershipState === 'active' ? teamSlugs : [], warnings };
}

async function connectionSnapshot(memberId: string) {
  const { data, error } = await supabase.from('workspace_github_connections').select('*').eq('member_id', memberId).maybeSingle();
  if (error) throw error;
  if (!data) return { connected: false, username: '', profileUrl: '', avatarUrl: '', email: '', membershipState: 'not_connected', teamSlugs: [], syncError: '', lastSyncedAt: '' };
  return {
    connected: true,
    username: data.github_username,
    profileUrl: data.profile_url,
    avatarUrl: data.avatar_url,
    email: data.email,
    membershipState: data.membership_state,
    teamSlugs: data.team_slugs ?? [],
    syncError: data.sync_error,
    lastSyncedAt: data.last_synced_at ?? '',
  };
}

async function removeManagedTeamAccess(memberId: string) {
  const { data, error } = await supabase.from('workspace_github_connections').select('*').eq('member_id', memberId).maybeSingle();
  if (error) throw error;
  if (!data) return [] as string[];
  const secrets = await getSecrets();
  const organization = secrets.github_organization || 'Flat-Reality';
  const token = await installationToken();
  const groups = await ensureAccessTeams(token, organization);
  const warnings: string[] = [];
  for (const group of groups) {
    try {
      await githubRequest(`/orgs/${encodeURIComponent(organization)}/teams/${encodeURIComponent(group.github_team_slug)}/memberships/${encodeURIComponent(data.github_username)}`, token, { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof Error && /not found/i.test(error.message))) warnings.push(`${group.display_name}: ${error instanceof Error ? error.message : 'Team access could not be removed.'}`);
    }
  }
  await supabase.from('workspace_github_connections').update({ team_slugs: [], sync_error: warnings.join(' | '), last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('member_id', memberId);
  return warnings;
}

async function synchronizeConnectedMembers(memberIds: string[], removedMemberIds: string[] = []) {
  const state = await loadState();
  const selected = new Set(memberIds);
  const members = selected.size ? state.members.filter((member) => selected.has(member.id)) : removedMemberIds.length ? [] : state.members;
  const secrets = await getSecrets();
  const organization = secrets.github_organization || 'Flat-Reality';
  await ensureAccessTeams(await installationToken(), organization);
  const warnings: string[] = [];
  for (const member of members) {
    const { data, error } = await supabase.from('workspace_github_connections').select('*').eq('member_id', member.id).maybeSingle();
    if (error) {
      warnings.push(`${displayName(member)}: ${error.message}`);
      continue;
    }
    if (!data) continue;
    try {
      const access = await synchronizeAccess(member, { id: Number(data.github_user_id), login: data.github_username, html_url: data.profile_url, avatar_url: data.avatar_url, email: data.email });
      warnings.push(...access.warnings.map((warning) => `${displayName(member)}: ${warning}`));
    } catch (error) {
      warnings.push(`${displayName(member)}: ${error instanceof Error ? error.message : 'GitHub access could not be synchronized.'}`);
    }
  }
  for (const memberId of removedMemberIds) {
    try {
      warnings.push(...(await removeManagedTeamAccess(memberId)).map((warning) => `${memberId}: ${warning}`));
    } catch (error) {
      warnings.push(`${memberId}: ${error instanceof Error ? error.message : 'GitHub team access could not be removed.'}`);
    }
  }
  return warnings;
}

async function callback(url: URL) {
  const errorMessage = url.searchParams.get('error_description') || url.searchParams.get('error');
  const code = url.searchParams.get('code') ?? '';
  const stateValue = url.searchParams.get('state') ?? '';
  const stateHash = stateValue ? await sha256Hex(stateValue) : '';
  const { data: oauthState } = stateHash
    ? await supabase.from('workspace_github_oauth_states').select('*').eq('state_hash', stateHash).maybeSingle()
    : { data: null };
  if (stateHash) await supabase.from('workspace_github_oauth_states').delete().eq('state_hash', stateHash);
  const returnUrl = oauthState?.return_url && allowedReturnUrl(oauthState.return_url) ? oauthState.return_url : DEFAULT_RETURN_URL;
  const redirect = new URL(returnUrl);

  try {
    if (errorMessage) throw new Error(errorMessage);
    if (!oauthState || new Date(oauthState.expires_at) <= new Date() || !code) throw new Error('GitHub authorization expired. Please try again.');
    const secrets = await getSecrets();
    if (!secrets.github_client_id || !secrets.github_client_secret) throw new Error('GitHub Client Secret is not configured yet.');
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: secrets.github_client_id, client_secret: secrets.github_client_secret, code, redirect_uri: CALLBACK_URL }),
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(tokenPayload.error_description || tokenPayload.error || 'GitHub authorization failed.');
    const profile = await githubRequest<{ id: number; login: string; html_url?: string; avatar_url?: string; email?: string }>('/user', tokenPayload.access_token);
    if (!profile.email) {
      const emails = await githubRequest<Array<{ email: string; primary?: boolean; verified?: boolean }>>('/user/emails', tokenPayload.access_token).catch(() => []);
      profile.email = emails.find((item) => item.primary && item.verified)?.email || emails.find((item) => item.verified)?.email || '';
    }
    const state = await loadState();
    const member = state.members.find((item) => item.id === oauthState.member_id);
    if (!member) throw new Error('Workspace profile was not found.');
    const access = await synchronizeAccess(member, profile);
    const nextMember = { ...member, githubConnected: true, githubUsername: profile.login, githubUserId: String(profile.id), githubAvatarUrl: profile.avatar_url ?? '', githubProfileUrl: profile.html_url ?? '' };
    const nextState = { ...state, members: state.members.map((item) => item.id === member.id ? nextMember : item) };
    await saveState(nextState);
    await audit('identity.github_linked', nextMember, `${displayName(nextMember)} linked GitHub account @${profile.login}.`, { membershipState: access.membershipState, teamSlugs: access.teamSlugs, warnings: access.warnings });
    redirect.searchParams.set('github', access.membershipState === 'active' ? 'connected' : 'invited');
  } catch (error) {
    redirect.searchParams.set('github_error', error instanceof Error ? error.message : 'GitHub connection failed.');
  }
  return Response.redirect(redirect.toString(), 302);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/callback')) return callback(url);
  if (request.method === 'GET' && url.pathname.endsWith('/setup')) {
    const id = Number(url.searchParams.get('installation_id'));
    if (id) {
      try {
        const installation = await githubRequest<{ id: number; account?: { id?: number; login?: string }; repository_selection?: string; suspended_at?: string | null }>(`/app/installations/${id}`, await appJwt());
        const secrets = await getSecrets();
        const organization = secrets.github_organization || 'Flat-Reality';
        if (installation.account?.login?.toLowerCase() === organization.toLowerCase()) {
          await supabase.from('workspace_github_installations').upsert({ organization_login: organization, installation_id: installation.id, account_id: installation.account?.id ?? null, repository_selection: installation.repository_selection ?? '', suspended_at: installation.suspended_at ?? null, updated_at: new Date().toISOString() });
        }
      } catch {
        // The connect screen will surface installation errors with the signed-in Workspace identity.
      }
    }
    return Response.redirect(`${DEFAULT_RETURN_URL}#/profile`, 302);
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const action = String(body.action ?? '');
    const authorization = request.headers.get('Authorization') ?? '';
    if (action === 'internal_sync_access' && authorization === `Bearer ${SERVICE_ROLE_KEY}`) {
      const memberIds = Array.isArray(body.memberIds) ? body.memberIds.map(String) : [];
      const removedMemberIds = Array.isArray(body.removedMemberIds) ? body.removedMemberIds.map(String) : [];
      return json({ ok: true, warnings: await synchronizeConnectedMembers(memberIds, removedMemberIds) });
    }
    const context = await actorFromToken(String(body.sessionToken ?? ''));
    if (!context) return json({ error: 'Session is invalid or expired.' }, 401);
    const targetId = String(body.memberId ?? context.actor.id);
    if (targetId !== context.actor.id && !context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
    const target = context.state.members.find((member) => member.id === targetId);
    if (!target) return json({ error: 'Workspace profile was not found.' }, 404);

    if (action === 'connect') {
      const secrets = await getSecrets();
      if (!secrets.github_client_id) return json({ error: 'GitHub Client ID is not configured.' }, 503);
      if (!secrets.github_client_secret) return json({ error: 'GitHub Client Secret is not configured yet.' }, 503);
      const returnUrl = String(body.returnUrl ?? DEFAULT_RETURN_URL);
      if (!allowedReturnUrl(returnUrl)) return json({ error: 'Return URL is not allowed.' }, 400);
      const stateValue = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      await supabase.from('workspace_github_oauth_states').delete().lt('expires_at', new Date().toISOString());
      const { error } = await supabase.from('workspace_github_oauth_states').insert({ state_hash: await sha256Hex(stateValue), member_id: context.actor.id, return_url: returnUrl, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
      if (error) throw error;
      const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
      authorizationUrl.searchParams.set('client_id', secrets.github_client_id);
      authorizationUrl.searchParams.set('redirect_uri', CALLBACK_URL);
      authorizationUrl.searchParams.set('state', stateValue);
      return json({ authorizationUrl: authorizationUrl.toString() });
    }

    if (action === 'snapshot') return json({ snapshot: await connectionSnapshot(target.id) });

    if (action === 'sync_all_access') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      return json({ ok: true, warnings: await synchronizeConnectedMembers([]) });
    }

    if (action === 'sync_access') {
      const { data } = await supabase.from('workspace_github_connections').select('*').eq('member_id', target.id).maybeSingle();
      if (!data) return json({ error: 'Connect a GitHub account first.' }, 400);
      const access = await synchronizeAccess(target, { id: Number(data.github_user_id), login: data.github_username, html_url: data.profile_url, avatar_url: data.avatar_url, email: data.email });
      await audit('identity.github_access_synced', context.actor, `GitHub access was synchronized for @${data.github_username}.`, { targetMemberId: target.id, membershipState: access.membershipState, teamSlugs: access.teamSlugs, warnings: access.warnings });
      return json({ snapshot: await connectionSnapshot(target.id) });
    }

    if (action === 'disconnect') {
      await supabase.from('workspace_github_connections').delete().eq('member_id', target.id);
      const nextMember = { ...target, githubConnected: false, githubUsername: '', githubUserId: '', githubAvatarUrl: '', githubProfileUrl: '' };
      await saveState({ ...context.state, members: context.state.members.map((member) => member.id === target.id ? nextMember : member) });
      await audit('identity.github_disconnected', context.actor, `GitHub was disconnected from ${displayName(target)}.`, { targetMemberId: target.id });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected GitHub integration error.' }, 500);
  }
});
