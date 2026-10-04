import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
let UPWORK_CLIENT_ID = Deno.env.get('UPWORK_CLIENT_ID') ?? '';
let UPWORK_CLIENT_SECRET = Deno.env.get('UPWORK_CLIENT_SECRET') ?? '';
let TOKEN_ENCRYPTION_KEY = Deno.env.get('UPWORK_TOKEN_ENCRYPTION_KEY') ?? '';
const CALLBACK_URL = `${SUPABASE_URL}/functions/v1/upwork-oauth/callback`;
const UPWORK_AUTHORIZE_URL = 'https://www.upwork.com/ab/account-security/oauth2/authorize';
const UPWORK_TOKEN_URL = 'https://www.upwork.com/api/v3/oauth2/token';
const UPWORK_GRAPHQL_URL = 'https://api.upwork.com/graphql';
const CACHE_HOURS = 23;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function ensureRuntimeSecrets() {
  if (UPWORK_CLIENT_ID && UPWORK_CLIENT_SECRET && TOKEN_ENCRYPTION_KEY) return;
  const { data, error } = await supabase.rpc('get_upwork_runtime_secrets');
  if (error) throw error;
  const secrets = (data ?? {}) as Record<string, string>;
  UPWORK_CLIENT_ID ||= secrets.upwork_client_id ?? '';
  UPWORK_CLIENT_SECRET ||= secrets.upwork_client_secret ?? '';
  TOKEN_ENCRYPTION_KEY ||= secrets.upwork_token_encryption_key ?? '';
}

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
  contractType?: string;
  benefitPrograms?: string[];
  withheldBalance?: number;
  estimatedHours?: string;
  isAdmin?: boolean;
};

type WorkspaceState = { members: WorkspaceMember[] };

type ActorContext = {
  actor: WorkspaceMember;
  state: WorkspaceState;
};

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function encodeBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function sha256(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

async function sha256Hex(value: string) {
  return Array.from(await sha256(value)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function encryptionKey() {
  await ensureRuntimeSecrets();
  if (!TOKEN_ENCRYPTION_KEY) throw new Error('Upwork token encryption is not configured.');
  const raw = await sha256(TOKEN_ENCRYPTION_KEY);
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `${encodeBase64Url(iv)}.${encodeBase64Url(new Uint8Array(encrypted))}`;
}

async function decryptToken(value: string) {
  const [ivValue, encryptedValue] = value.split('.');
  if (!ivValue || !encryptedValue) throw new Error('Stored Upwork credentials are invalid.');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decodeBase64Url(ivValue) }, await encryptionKey(), decodeBase64Url(encryptedValue));
  return new TextDecoder().decode(decrypted);
}

async function loadState(): Promise<WorkspaceState> {
  const { data, error } = await supabase.from('workspace_state').select('state').eq('id', 'workspace').single();
  if (error || !data?.state) throw new Error('Workspace state was not found.');
  return data.state as WorkspaceState;
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

function isEligible(member: WorkspaceMember) {
  return String(member.contractType ?? '').toUpperCase().includes('INDEPENDENT') || (member.benefitPrograms ?? []).includes('FR Partners');
}

function displayName(member: WorkspaceMember) {
  return member.preferredName?.trim() || member.fullName?.trim() || member.employmentId;
}

async function audit(eventType: string, actor: WorkspaceMember, target: WorkspaceMember, summary: string, payload: Record<string, unknown> = {}) {
  await supabase.from('workspace_audit_log').insert({
    event_type: eventType,
    actor_member_id: actor.id,
    event_payload: { ...payload, actorName: displayName(actor), targetMemberId: target.id, targetName: displayName(target), summary },
  });
}

function allowedReturnUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return false;
    return url.hostname === 'flat-reality.github.io' || url.hostname === 'workspace.flatreality.eu' || url.hostname === 'localhost';
  } catch {
    return false;
  }
}

function tokenParams(values: Record<string, string>) {
  return new URLSearchParams({ client_id: UPWORK_CLIENT_ID, client_secret: UPWORK_CLIENT_SECRET, ...values });
}

async function exchangeToken(values: Record<string, string>): Promise<TokenResponse> {
  await ensureRuntimeSecrets();
  const response = await fetch(UPWORK_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: tokenParams(values),
  });
  const payload = await response.json().catch(() => ({})) as Partial<TokenResponse> & { error?: string; error_description?: string };
  if (!response.ok || !payload.access_token || !payload.refresh_token) {
    throw new Error(payload.error_description || payload.error || `Upwork token request failed (${response.status}).`);
  }
  return payload as TokenResponse;
}

async function saveTokens(memberId: string, tokens: TokenResponse) {
  const expiresAt = new Date(Date.now() + Number(tokens.expires_in || 86400) * 1000).toISOString();
  const { error } = await supabase.from('workspace_upwork_connections').upsert({
    member_id: memberId,
    access_token_ciphertext: await encryptToken(tokens.access_token),
    refresh_token_ciphertext: await encryptToken(tokens.refresh_token),
    token_expires_at: expiresAt,
    granted_scopes: String(tokens.scope ?? '').split(/\s+/).filter(Boolean),
    status: 'connected',
    sync_error: '',
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return tokens.access_token;
}

async function accessTokenFor(memberId: string) {
  const { data, error } = await supabase.from('workspace_upwork_connections').select('*').eq('member_id', memberId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.token_expires_at).getTime() > Date.now() + 5 * 60 * 1000) return decryptToken(data.access_token_ciphertext);
  const refreshed = await exchangeToken({ grant_type: 'refresh_token', refresh_token: await decryptToken(data.refresh_token_ciphertext) });
  return saveTokens(memberId, refreshed);
}

async function graphql<T>(accessToken: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(UPWORK_GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = await response.json().catch(() => ({})) as { data?: T; errors?: Array<{ message?: string }> };
  if (!response.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.map((item) => item.message).filter(Boolean).join(' ') || `Upwork API request failed (${response.status}).`);
  }
  return payload.data;
}

function money(value: unknown, fallbackCurrency = 'USD') {
  const item = (value ?? {}) as Record<string, unknown>;
  const display = String(item.displayValue ?? item.amount ?? '0').replace(/[^0-9.-]/g, '');
  return { amount: Number(display || 0), currency: String(item.currency ?? fallbackCurrency) };
}

function contractStatus(value: unknown): 'Active' | 'Paused' | 'Closed' {
  const normalized = String(value ?? '').toUpperCase();
  if (normalized === 'ACTIVE') return 'Active';
  if (normalized === 'PAUSED') return 'Paused';
  return 'Closed';
}

async function purgeExpiredCache() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  await Promise.all([
    supabase.from('workspace_upwork_contracts').delete().lt('cached_at', cutoff),
    supabase.from('workspace_upwork_payment_summaries').delete().lt('cached_at', cutoff),
    supabase.from('workspace_upwork_time_entries').delete().lt('cached_at', cutoff),
    supabase.from('workspace_upwork_oauth_states').delete().lt('expires_at', new Date().toISOString()),
  ]);
}

async function syncMember(member: WorkspaceMember, force = false) {
  const { data: connection, error } = await supabase.from('workspace_upwork_connections').select('*').eq('member_id', member.id).maybeSingle();
  if (error) throw error;
  if (!connection) return;
  const lastSync = connection.last_synced_at ? new Date(connection.last_synced_at).getTime() : 0;
  if (!force && Date.now() - lastSync < CACHE_HOURS * 60 * 60 * 1000) return;

  try {
    const accessToken = await accessTokenFor(member.id);
    if (!accessToken) return;
    const identity = await graphql<{
      user: { id: string; rid?: string; name?: string; photoUrl?: string; ciphertext?: string; freelancerProfile?: { personalData?: { title?: string; chargeRate?: { displayValue?: string; currency?: string } } } };
    }>(accessToken, `query WorkspaceUpworkIdentity { user { id rid name photoUrl ciphertext freelancerProfile { personalData { title chargeRate { displayValue currency } } } } }`);

    const upworkUserId = String(identity.user.id || identity.user.rid || '');
    const profileKey = String(identity.user.ciphertext ?? '');
    let profileUrl = profileKey ? `https://www.upwork.com/freelancers/${profileKey}` : '';
    let photoUrl = String(identity.user.photoUrl ?? '');
    if (upworkUserId) {
      try {
        const details = await graphql<{ userDetails: { publicUrl?: string; photoUrl?: string } }>(accessToken, `query WorkspaceUpworkUserDetails($id: ID!) { userDetails(id: $id) { publicUrl photoUrl } }`, { id: upworkUserId });
        profileUrl = details.userDetails.publicUrl || profileUrl;
        photoUrl = details.userDetails.photoUrl || photoUrl;
      } catch {
        // The profile still remains usable when optional public details are unavailable.
      }
    }

    const profileRate = money(identity.user.freelancerProfile?.personalData?.chargeRate);
    await supabase.from('workspace_upwork_connections').update({
      upwork_user_id: upworkUserId,
      profile_url: profileUrl,
      profile_title: identity.user.freelancerProfile?.personalData?.title ?? '',
      profile_rate: profileRate.amount,
      profile_currency: profileRate.currency,
      photo_url: photoUrl,
      status: 'connected',
      sync_error: '',
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('member_id', member.id);

    if (upworkUserId) {
      const contractsResult = await graphql<{ vendorContracts: { contracts: Array<Record<string, unknown>> } }>(accessToken, `
        query WorkspaceVendorContracts($filter: VendorContractSearchFilter!, $options: ContractOptionsInput) {
          vendorContracts(filter: $filter, options: $options) {
            contracts {
              id title status startDate endDate
              hourlyLimits { weeklyLimit startDate endDate }
              terms {
                hourlyTerms { hourlyRate { displayValue currency } startDate endDate }
                fixedPriceTerms {
                  fpCharge { displayValue currency }
                  startDate endDate
                  milestones { id description state currentEscrowAmount { displayValue currency } paid { displayValue currency } }
                }
              }
            }
          }
        }
      `, {
        filter: { vendorId: upworkUserId, contractStatuses: ['ACTIVE', 'PAUSED', 'CLOSED'] },
        options: { addTerms: true, addHourLimits: true },
      });

      const contracts = (contractsResult.vendorContracts?.contracts ?? []).map((raw) => {
        const terms = (raw.terms ?? {}) as Record<string, unknown>;
        const hourlyTerms = Array.isArray(terms.hourlyTerms) ? terms.hourlyTerms as Array<Record<string, unknown>> : [];
        const fixedTerms = Array.isArray(terms.fixedPriceTerms) ? terms.fixedPriceTerms as Array<Record<string, unknown>> : [];
        const latestHourly = hourlyTerms.at(-1);
        const latestFixed = fixedTerms.at(-1);
        const milestones = Array.isArray(latestFixed?.milestones) ? latestFixed?.milestones as Array<Record<string, unknown>> : [];
        const currentMilestone = milestones.find((item) => ['ACTIVE', 'SUBMITTED', 'InOffer', 'Active', 'Submitted'].includes(String(item.state))) ?? null;
        const type = latestHourly ? 'hourly' : 'fixed-price';
        const rate = money(latestHourly?.hourlyRate ?? latestFixed?.fpCharge);
        const limits = Array.isArray(raw.hourlyLimits) ? raw.hourlyLimits as Array<Record<string, unknown>> : [];
        const latestLimit = limits.at(-1);
        const milestoneMoney = money(currentMilestone?.currentEscrowAmount ?? currentMilestone?.paid, rate.currency);
        return {
          member_id: member.id,
          upwork_contract_id: String(raw.id),
          title: String(raw.title ?? ''),
          contract_type: type,
          rate: rate.amount,
          currency: rate.currency,
          weekly_limit: latestLimit ? Number(latestLimit.weeklyLimit ?? 0) : null,
          status: contractStatus(raw.status),
          start_date: raw.startDate || null,
          end_date: raw.endDate || null,
          current_milestone_id: currentMilestone ? String(currentMilestone.id ?? '') : null,
          current_milestone_description: currentMilestone ? String(currentMilestone.description ?? '') : '',
          current_milestone_amount: currentMilestone ? milestoneMoney.amount : null,
          payload: raw,
          cached_at: new Date().toISOString(),
        };
      });
      await supabase.from('workspace_upwork_contracts').delete().eq('member_id', member.id);
      if (contracts.length) await supabase.from('workspace_upwork_contracts').insert(contracts);

      const rangeEnd = new Date().toISOString().slice(0, 10);
      const rangeStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const reports = await graphql<{ user: { contractTimeReport: { edges: Array<{ cursor?: string; node: Record<string, unknown> }> } } }>(accessToken, `
        query WorkspaceTimeReport($range: DateTimeRange!, $pagination: Pagination) {
          user {
            contractTimeReport(timeReportDate_bt: $range, pagination: $pagination) {
              edges { cursor node { dateWorkedOn totalCharges totalHoursWorked memo contract { id title } } }
            }
          }
        }
      `, { range: { rangeStart, rangeEnd }, pagination: { after: null, first: 100 } });
      const entries = (reports.user?.contractTimeReport?.edges ?? []).map((edge, index) => {
        const node = edge.node ?? {};
        const contract = (node.contract ?? {}) as Record<string, unknown>;
        return {
          member_id: member.id,
          entry_id: String(edge.cursor || `${node.dateWorkedOn}-${contract.id}-${index}`),
          worked_on: String(node.dateWorkedOn ?? rangeEnd),
          hours: Number(node.totalHoursWorked ?? 0),
          charges: Number(node.totalCharges ?? 0),
          currency: 'USD',
          contract_id: String(contract.id ?? ''),
          contract_title: String(contract.title ?? ''),
          memo: String(node.memo ?? ''),
          cached_at: new Date().toISOString(),
        };
      });
      await supabase.from('workspace_upwork_time_entries').delete().eq('member_id', member.id);
      if (entries.length) await supabase.from('workspace_upwork_time_entries').insert(entries);
      const earnings = entries.reduce((total, item) => total + item.charges, 0);
      const fixedPriceMilestones = contracts.reduce((total, contract) => total + Number(contract.current_milestone_amount ?? 0), 0);
      await supabase.from('workspace_upwork_payment_summaries').upsert({
        member_id: member.id,
        earnings,
        fees: 0,
        fixed_price_milestones: fixedPriceMilestones,
        paid: earnings,
        pending: fixedPriceMilestones,
        currency: contracts[0]?.currency ?? 'USD',
        cached_at: new Date().toISOString(),
      });
    }
  } catch (error) {
    await supabase.from('workspace_upwork_connections').update({
      status: 'error',
      sync_error: error instanceof Error ? error.message.slice(0, 500) : 'Upwork synchronization failed.',
      updated_at: new Date().toISOString(),
    }).eq('member_id', member.id);
    throw error;
  }
}

async function snapshotFor(member: WorkspaceMember, force = false) {
  await ensureRuntimeSecrets();
  await purgeExpiredCache();
  const eligible = isEligible(member);
  const { data: connection } = await supabase.from('workspace_upwork_connections').select('*').eq('member_id', member.id).maybeSingle();
  if (connection) {
    try {
      await syncMember(member, force);
    } catch {
      // Return the previous cache and the synchronization error to the UI.
    }
  }
  const [{ data: latestConnection }, { data: contracts }, { data: payments }, { data: entries }] = await Promise.all([
    supabase.from('workspace_upwork_connections').select('*').eq('member_id', member.id).maybeSingle(),
    supabase.from('workspace_upwork_contracts').select('*').eq('member_id', member.id).order('start_date', { ascending: false }),
    supabase.from('workspace_upwork_payment_summaries').select('*').eq('member_id', member.id).maybeSingle(),
    supabase.from('workspace_upwork_time_entries').select('*').eq('member_id', member.id).order('worked_on', { ascending: false }).limit(100),
  ]);
  const connected = Boolean(latestConnection);
  const unavailable = !UPWORK_CLIENT_ID || !UPWORK_CLIENT_SECRET || !TOKEN_ENCRYPTION_KEY;
  const withheld = Number(member.withheldBalance ?? 0);
  return {
    eligible,
    connected,
    available: !unavailable,
    connectionStatus: unavailable ? 'disabled' : latestConnection?.status === 'error' ? 'error' : connected ? 'connected' : 'not_connected',
    message: unavailable ? 'Upwork API access is waiting for activation.' : latestConnection?.sync_error || (connected ? 'Upwork is connected.' : 'Connect Upwork to synchronize partner data.'),
    lastSyncedAt: latestConnection?.last_synced_at ?? '',
    profile: latestConnection ? {
      url: latestConnection.profile_url ?? '',
      title: latestConnection.profile_title ?? '',
      rate: latestConnection.profile_rate === null ? null : { amount: Number(latestConnection.profile_rate), currency: latestConnection.profile_currency ?? 'USD' },
      photoUrl: latestConnection.photo_url ?? '',
    } : null,
    contracts: (contracts ?? []).map((contract) => ({
      id: contract.upwork_contract_id,
      title: contract.title,
      type: contract.contract_type,
      rate: contract.rate === null ? null : { amount: Number(contract.rate), currency: contract.currency },
      weeklyLimit: contract.weekly_limit === null ? null : Number(contract.weekly_limit),
      status: contract.status,
      startDate: contract.start_date ?? '',
      endDate: contract.end_date ?? '',
      currentMilestone: contract.current_milestone_id ? {
        id: contract.current_milestone_id,
        description: contract.current_milestone_description,
        amount: { amount: Number(contract.current_milestone_amount ?? 0), currency: contract.currency },
      } : null,
    })),
    payments: payments ? {
      earnings: { amount: Number(payments.earnings), currency: payments.currency },
      fees: { amount: Number(payments.fees), currency: payments.currency },
      paid: { amount: Number(payments.paid), currency: payments.currency },
      pending: { amount: Number(payments.pending), currency: payments.currency },
      fixedPriceMilestones: { amount: Number(payments.fixed_price_milestones), currency: payments.currency },
      withheldBalance: withheld,
      reconciledBalance: withheld + Number(payments.pending) - Number(payments.paid),
    } : null,
    timeEntries: (entries ?? []).map((entry) => ({
      id: entry.entry_id,
      date: entry.worked_on,
      hours: Number(entry.hours),
      charges: Number(entry.charges),
      currency: entry.currency,
      contractId: entry.contract_id,
      contractTitle: entry.contract_title,
      memo: entry.memo,
    })),
  };
}

async function handleCallback(url: URL) {
  const stateValue = url.searchParams.get('state') ?? '';
  const code = url.searchParams.get('code') ?? '';
  const errorMessage = url.searchParams.get('error_description') || url.searchParams.get('error');
  const stateHash = await sha256Hex(stateValue);
  const { data: oauthState } = await supabase.from('workspace_upwork_oauth_states').select('*').eq('state_hash', stateHash).maybeSingle();
  const returnUrl = oauthState?.return_url && allowedReturnUrl(oauthState.return_url) ? oauthState.return_url : 'https://flat-reality.github.io/FRWorkspace/';
  const destination = new URL(returnUrl);
  if (!oauthState || new Date(oauthState.expires_at) <= new Date()) {
    destination.searchParams.set('upwork_error', 'The Upwork connection request expired. Please try again.');
    return Response.redirect(destination.toString(), 302);
  }
  await supabase.from('workspace_upwork_oauth_states').delete().eq('state_hash', stateHash);
  if (errorMessage || !code) {
    destination.searchParams.set('upwork_error', errorMessage || 'Upwork did not return an authorization code.');
    return Response.redirect(destination.toString(), 302);
  }
  try {
    const tokens = await exchangeToken({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK_URL, code_verifier: oauthState.code_verifier });
    await saveTokens(oauthState.member_id, tokens);
    const state = await loadState();
    const member = state.members.find((item) => item.id === oauthState.member_id);
    if (member) {
      await syncMember(member, true).catch(() => undefined);
      await audit('upwork.connected', member, member, `${displayName(member)} connected Upwork.`);
    }
    destination.searchParams.set('upwork', 'connected');
  } catch (error) {
    destination.searchParams.set('upwork_error', error instanceof Error ? error.message : 'Upwork connection failed.');
  }
  return Response.redirect(destination.toString(), 302);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname.endsWith('/callback')) return handleCallback(url);
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const context = await actorFromToken(String(body.sessionToken ?? ''));
    if (!context) return json({ error: 'Session is invalid or expired.' }, 401);
    const targetMemberId = String(body.memberId ?? context.actor.id);
    if (targetMemberId !== context.actor.id && !context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
    const target = context.state.members.find((member) => member.id === targetMemberId);
    if (!target) return json({ error: 'Workspace member was not found.' }, 404);
    const action = String(body.action ?? '');

    if (action === 'snapshot') return json({ snapshot: await snapshotFor(target, Boolean(body.force)) });

    if (action === 'connect') {
      if (target.id !== context.actor.id) return json({ error: 'Each partner must connect their own Upwork account.' }, 403);
      if (!isEligible(target)) return json({ error: 'Upwork is available to Independent Partners and FR Partners members.' }, 403);
      await ensureRuntimeSecrets();
      if (!UPWORK_CLIENT_ID || !UPWORK_CLIENT_SECRET || !TOKEN_ENCRYPTION_KEY) return json({ error: 'Upwork API access is waiting for activation.' }, 503);
      const returnUrl = String(body.returnUrl ?? '');
      if (!allowedReturnUrl(returnUrl)) return json({ error: 'Invalid Workspace return URL.' }, 400);
      const stateValue = encodeBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      const verifier = encodeBase64Url(crypto.getRandomValues(new Uint8Array(48)));
      const challenge = encodeBase64Url(await sha256(verifier));
      await supabase.from('workspace_upwork_oauth_states').insert({
        state_hash: await sha256Hex(stateValue),
        member_id: target.id,
        code_verifier: verifier,
        return_url: returnUrl,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      const authorizationUrl = new URL(UPWORK_AUTHORIZE_URL);
      authorizationUrl.searchParams.set('response_type', 'code');
      authorizationUrl.searchParams.set('client_id', UPWORK_CLIENT_ID);
      authorizationUrl.searchParams.set('redirect_uri', CALLBACK_URL);
      authorizationUrl.searchParams.set('redirect_url', CALLBACK_URL);
      authorizationUrl.searchParams.set('state', stateValue);
      authorizationUrl.searchParams.set('code_challenge', challenge);
      authorizationUrl.searchParams.set('code_challenge_method', 'S256');
      return json({ authorizationUrl: authorizationUrl.toString() });
    }

    if (action === 'disconnect') {
      await Promise.all([
        supabase.from('workspace_upwork_connections').delete().eq('member_id', target.id),
        supabase.from('workspace_upwork_contracts').delete().eq('member_id', target.id),
        supabase.from('workspace_upwork_payment_summaries').delete().eq('member_id', target.id),
        supabase.from('workspace_upwork_time_entries').delete().eq('member_id', target.id),
      ]);
      await audit('upwork.disconnected', context.actor, target, `${displayName(context.actor)} disconnected Upwork for ${displayName(target)}.`);
      return json({ ok: true });
    }

    if (action === 'create_contract') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const draft = body.draft as Record<string, unknown>;
      if (String(draft.memberId ?? '') !== target.id) return json({ error: 'Contract member does not match the selected profile.' }, 400);
      const title = String(draft.title ?? '').trim();
      if (!title) return json({ error: 'Contract name is required.' }, 400);
      const { error } = await supabase.from('workspace_upwork_contract_drafts').insert({
        member_id: target.id,
        created_by_member_id: context.actor.id,
        title,
        contract_type: draft.type === 'fixed-price' ? 'fixed-price' : 'hourly',
        rate: Number(draft.rate ?? 0),
        weekly_limit: Number(draft.weeklyLimit ?? 0),
        milestone_description: String(draft.milestoneDescription ?? ''),
        milestone_amount: Number(draft.milestoneAmount ?? 0),
        start_date: draft.startDate || null,
        end_date: draft.endDate || null,
      });
      if (error) throw error;
      await audit('upwork.contract_draft_created', context.actor, target, `${displayName(context.actor)} prepared an Upwork contract for ${displayName(target)}.`, { title });
      return json({ snapshot: await snapshotFor(target, false), staged: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected Upwork integration error.' }, 500);
  }
});
