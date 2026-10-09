import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const STATE_ID = 'workspace';
const SESSION_DAYS = 90;
const ENTRA_IDLE_HOURS = 1;
const ENTRA_MAX_HOURS = 24;
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
  fullName?: string;
  entraEmail?: string;
  entraObjectId?: string;
  entraSetupCompleted?: boolean;
  workEmail?: string;
  workStartDate?: string;
  contractType?: string;
  addressOfResidence?: string;
  addressStreet?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
  addressCountry?: string;
  citizenshipCountry?: string;
  personalEmail?: string;
  slackTag?: string;
  jobRole?: string;
  estimatedHours?: string;
  benefitPrograms?: string[];
  strikeSystem?: number;
  languages?: string;
  software?: string;
  seniority?: string;
  rate?: string;
  partnerStatus?: string;
  onboarding?: Record<string, unknown>;
  phoneNumber?: string;
  timeZone?: string;
  portfolio?: string;
  upworkUrl?: string;
  lastSeenAt?: string;
  employmentIdExpiresAt?: string;
  skills?: string[];
  endorsedSkills?: string[];
  permissions?: string[];
  permissionDetails?: string[];
  upworkRequired?: boolean;
  allowLegacyLogin?: boolean;
  githubConnected?: boolean;
  githubUsername?: string;
  githubUserId?: string;
  githubAvatarUrl?: string;
  githubProfileUrl?: string;
  steamConnected?: boolean;
  steamId?: string;
  steamProfileUrl?: string;
  status?: string;
};

type WorkspaceState = {
  members: WorkspaceMember[];
  levels: unknown[];
  rewards: unknown[];
  guidePages: unknown[];
  workRecords: Array<Record<string, unknown> & { id: string; memberId: string; type: string; explanationText?: string; explanationSubmittedAt?: string }>;
  scheduleShifts: Array<Record<string, unknown> & { memberId: string }>;
  scheduleCompletions: Array<Record<string, unknown> & { memberId: string }>;
  fileProjects: Array<Record<string, unknown> & { id: string; resources?: Array<Record<string, unknown> & { id: string }> }>;
};

type AuditEvent = {
  eventType: string;
  actor?: WorkspaceMember | null;
  target?: WorkspaceMember | null;
  summary: string;
  payload?: Record<string, unknown>;
};

type AccessGroup = {
  group_key: string;
  display_name: string;
  group_kind: 'account_type' | 'role' | 'creative' | 'project';
  workspace_value: string;
  entra_group_id: string;
  github_team_slug: string;
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

const ENTRA_EMAIL_DOMAINS = new Set(['flatreality.eu', 'flatrealitycompany.onmicrosoft.com']);

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function isAllowedEntraEmail(value: unknown) {
  const [localPart, domain, ...rest] = normalizeEmail(value).split('@');
  return Boolean(localPart && domain && !rest.length && ENTRA_EMAIL_DOMAINS.has(domain));
}

function validateEntraProfiles(state: WorkspaceState) {
  const emails = new Set<string>();
  const objectIds = new Set<string>();
  for (const member of state.members) {
    const email = normalizeEmail(member.entraEmail || member.workEmail);
    if (email && !isAllowedEntraEmail(email)) return 'Entra ID Email must use @flatreality.eu or @flatrealitycompany.onmicrosoft.com.';
    if (email && emails.has(email)) return 'Each Entra ID Email can be linked to only one Workspace profile.';
    if (email) emails.add(email);
    const objectId = String(member.entraObjectId ?? '').trim();
    if (objectId && objectIds.has(objectId)) return 'Each Entra identity can be linked to only one Workspace profile.';
    if (objectId) objectIds.add(objectId);
  }
  return '';
}

let graphSecrets: Record<string, string> | null = null;

async function getGraphSecrets() {
  if (graphSecrets) return graphSecrets;
  const { data, error } = await supabase.rpc('get_entra_runtime_secrets');
  if (error) throw error;
  graphSecrets = (data ?? {}) as Record<string, string>;
  return graphSecrets;
}

async function getGraphAccessToken() {
  const secrets = await getGraphSecrets();
  const tenantId = secrets.entra_tenant_id;
  const clientId = secrets.entra_client_id;
  const clientSecret = secrets.entra_client_secret;
  if (!tenantId || !clientId || !clientSecret) throw new Error('Microsoft Graph integration is not configured.');
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) throw new Error(payload.error_description || 'Microsoft Graph authorization failed.');
  return String(payload.access_token);
}

function splitName(fullName = '') {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return { givenName: parts[0] || undefined, surname: parts.length > 1 ? parts.slice(1).join(' ') : undefined };
}

function entraComparable(member: WorkspaceMember) {
  const { givenName, surname } = splitName(member.fullName);
  return {
    displayName: member.preferredName?.trim() || member.fullName?.trim() || member.employmentId,
    givenName,
    surname,
    employeeId: member.employmentId,
    employeeType: member.contractType || null,
    jobTitle: member.jobRole || null,
    mail: member.entraEmail,
    streetAddress: member.addressStreet || member.addressOfResidence || null,
    city: member.addressCity || null,
    state: member.addressState || null,
    postalCode: member.addressPostalCode || null,
    country: member.addressCountry || member.citizenshipCountry || null,
    extensions: [
      { id: 'com.flatreality.workspace.identity', data: { employmentId: member.employmentId, fullName: member.fullName || '', preferredName: member.preferredName || '', workStartDate: member.workStartDate || '', accountType: member.contractType || '', employmentIdExpiresAt: member.employmentIdExpiresAt || '', citizenshipCountry: member.citizenshipCountry || '', personalEmail: member.personalEmail || '', slackTag: member.slackTag || '', phoneNumber: member.phoneNumber || '', timeZone: member.timeZone || '', jobRole: member.jobRole || '', seniority: member.seniority || '' } },
      { id: 'com.flatreality.workspace.work', data: { estimatedHours: member.estimatedHours || '', rate: member.rate || '', partnerStatus: member.partnerStatus || '', strikeSystem: Number(member.strikeSystem || 0), portfolio: member.portfolio || '', upworkUrl: member.upworkUrl || '', connectedProjects: member.benefitPrograms || [], permissions: member.permissions || [], permissionDetails: member.permissionDetails || [], upworkRequired: Boolean(member.upworkRequired), allowLegacyLogin: member.allowLegacyLogin !== false, skills: member.skills || [], endorsedSkills: member.endorsedSkills || [], languages: member.languages || '', software: member.software || '', githubConnected: Boolean(member.githubConnected), githubUsername: member.githubUsername || '', githubUserId: member.githubUserId || '', steamConnected: Boolean(member.steamConnected), steamId: member.steamId || '', onboarding: member.onboarding || {} } },
    ],
  };
}

async function graphRequest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Microsoft Graph returned ${response.status}.`);
  return payload;
}

async function loadAccessGroups(): Promise<AccessGroup[]> {
  const { data, error } = await supabase.from('workspace_access_groups').select('*').order('display_name');
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

function accessComparable(member: WorkspaceMember) {
  return [...desiredAccessGroupKeys(member)].sort();
}

async function directEntraGroupIds(member: WorkspaceMember, token: string) {
  const userId = String(member.entraObjectId || member.entraEmail || '').trim();
  if (!userId) return new Set<string>();
  const ids = new Set<string>();
  let path = `/users/${encodeURIComponent(userId)}/memberOf/microsoft.graph.group?$select=id&$top=999`;
  while (path) {
    const page = await graphRequest(path, token) as { value?: Array<{ id?: string }>; '@odata.nextLink'?: string };
    for (const item of page.value ?? []) if (item.id) ids.add(item.id);
    const next = page['@odata.nextLink'];
    path = next ? next.replace('https://graph.microsoft.com/v1.0', '') : '';
  }
  return ids;
}

async function syncMemberAccessGroups(member: WorkspaceMember, groups: AccessGroup[], token: string) {
  let objectId = String(member.entraObjectId || '').trim();
  if (!objectId && member.entraEmail) {
    const profile = await graphRequest(`/users/${encodeURIComponent(member.entraEmail)}?$select=id`, token) as { id?: string };
    objectId = String(profile.id ?? '');
  }
  if (!objectId) return [`${displayName(member)} does not have a resolvable Entra identity.`];
  const desired = desiredAccessGroupKeys(member);
  const current = await directEntraGroupIds(member, token);
  const warnings: string[] = [];
  for (const group of groups) {
    const shouldBeMember = desired.has(group.group_key);
    const isMember = current.has(group.entra_group_id);
    if (shouldBeMember === isMember) continue;
    try {
      if (shouldBeMember) {
        await graphRequest(`/groups/${group.entra_group_id}/members/$ref`, token, {
          method: 'POST',
          body: JSON.stringify({ '@odata.id': `https://graph.microsoft.com/v1.0/directoryObjects/${objectId}` }),
        });
      } else {
        await graphRequest(`/groups/${group.entra_group_id}/members/${objectId}/$ref`, token, { method: 'DELETE' });
      }
    } catch (error) {
      warnings.push(`${group.display_name}: ${error instanceof Error ? error.message : 'Membership could not be synchronized.'}`);
    }
  }
  return warnings;
}

async function syncGitHubAccess(memberIds: string[], removedMemberIds: string[] = []) {
  if (!memberIds.length && !removedMemberIds.length) return [] as string[];
  const response = await fetch(`${SUPABASE_URL}/functions/v1/github-integration`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'internal_sync_access', memberIds, removedMemberIds }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return [payload.error || `GitHub access synchronization returned ${response.status}.`];
  return Array.isArray(payload.warnings) ? payload.warnings : [];
}

async function syncChangedAccessGroups(before: WorkspaceState, after: WorkspaceState, actor: WorkspaceMember) {
  const previous = new Map(before.members.map((member) => [member.id, member]));
  const changed = after.members.filter((member) => {
    const oldMember = previous.get(member.id);
    return !oldMember || JSON.stringify(accessComparable(oldMember)) !== JSON.stringify(accessComparable(member));
  });
  const currentIds = new Set(after.members.map((member) => member.id));
  const removed = before.members.filter((member) => !currentIds.has(member.id));
  if (!changed.length && !removed.length) return [] as string[];
  const groups = await loadAccessGroups();
  const token = await getGraphAccessToken();
  const warnings: string[] = [];
  for (const member of changed) {
    if (member.entraObjectId || member.entraEmail) warnings.push(...await syncMemberAccessGroups(member, groups, token));
  }
  for (const member of removed) {
    warnings.push(...await syncMemberAccessGroups({ ...member, contractType: '', permissions: [], permissionDetails: [], benefitPrograms: [], isAdmin: false }, groups, token));
  }
  warnings.push(...await syncGitHubAccess(changed.map((member) => member.id), removed.map((member) => member.id)));
  await writeAuditLog({
    eventType: warnings.length ? 'access.groups_sync_partial' : 'access.groups_synced',
    actor,
    summary: `Access groups were synchronized for ${changed.length + removed.length} Workspace profile${changed.length + removed.length === 1 ? '' : 's'}.`,
    payload: { memberIds: changed.map((member) => member.id), removedMemberIds: removed.map((member) => member.id), warnings },
  });
  return warnings;
}

function applyEntraAccess(member: WorkspaceMember, groupKeys: Set<string>) {
  const managedRoles = new Set(['Admin', 'Community', 'Developer', 'HR', 'Operations', 'Creative']);
  const permissions = (member.permissions ?? []).filter((value) => !managedRoles.has(value));
  if (groupKeys.has('administration')) permissions.push('Admin');
  if (groupKeys.has('community')) permissions.push('Community');
  if (groupKeys.has('developers')) permissions.push('Developer');
  if (groupKeys.has('hr')) permissions.push('HR');
  if (groupKeys.has('operations')) permissions.push('Operations');
  if (groupKeys.has('creative_artists') || groupKeys.has('creative_audio') || groupKeys.has('creative_game_designers')) permissions.push('Creative');

  const managedDetails = new Set(['Art', 'Music', 'Sound Design', 'Game & Level Design']);
  const permissionDetails = (member.permissionDetails ?? []).filter((value) => !managedDetails.has(value));
  if (groupKeys.has('creative_artists')) permissionDetails.push('Art');
  if (groupKeys.has('creative_audio')) permissionDetails.push('Music', 'Sound Design');
  if (groupKeys.has('creative_game_designers')) permissionDetails.push('Game & Level Design');

  const managedProjects = new Set(['FR Partners', 'RAIN HEART', 'The Nick']);
  const benefitPrograms = (member.benefitPrograms ?? []).filter((value) => !managedProjects.has(value));
  if (groupKeys.has('project_partners')) benefitPrograms.push('FR Partners');
  if (groupKeys.has('project_rain_heart')) benefitPrograms.push('RAIN HEART');
  if (groupKeys.has('project_the_nick')) benefitPrograms.push('The Nick');

  let contractType = member.contractType;
  if (groupKeys.has('core_team')) contractType = 'CORE TEAM';
  else if (groupKeys.has('independent_partner')) contractType = 'INDEPENDENT PARTNER';

  return { ...member, contractType, permissions, permissionDetails, benefitPrograms, isAdmin: groupKeys.has('administration') };
}

async function reconcileAccessFromEntra(state: WorkspaceState, actor: WorkspaceMember) {
  const groups = await loadAccessGroups();
  const byId = new Map(groups.map((group) => [group.entra_group_id, group.group_key]));
  const token = await getGraphAccessToken();
  const members: WorkspaceMember[] = [];
  const warnings: string[] = [];
  for (const member of state.members) {
    if (!member.entraObjectId && !member.entraEmail) {
      members.push(member);
      continue;
    }
    try {
      const ids = await directEntraGroupIds(member, token);
      members.push(applyEntraAccess(member, new Set([...ids].map((id) => byId.get(id)).filter(Boolean) as string[])));
    } catch (error) {
      members.push(member);
      warnings.push(`${displayName(member)}: ${error instanceof Error ? error.message : 'Entra membership could not be read.'}`);
    }
  }
  const nextState = { ...state, members };
  const { error } = await supabase.from('workspace_state').upsert({ id: STATE_ID, state: nextState, updated_at: new Date().toISOString() });
  if (error) throw error;
  warnings.push(...await syncGitHubAccess(members.map((member) => member.id)));
  await writeAuditLog({ eventType: warnings.length ? 'access.entra_reconcile_partial' : 'access.entra_reconciled', actor, summary: 'Workspace access was reconciled from the canonical Microsoft Entra group matrix.', payload: { warnings } });
  return { state: nextState, warnings };
}

async function syncMemberToEntra(member: WorkspaceMember) {
  const userId = String(member.entraObjectId || member.entraEmail || '').trim();
  if (!userId || !isAllowedEntraEmail(member.entraEmail || '')) return;
  const token = await getGraphAccessToken();
  const mapped = entraComparable(member);
  const { extensions, ...nativeFields } = mapped;
  const warnings: string[] = [];
  let synchronizedFields = 0;
  const patchedFields = new Map<string, unknown>();
  const userPath = `/users/${encodeURIComponent(userId)}`;

  const deprecatedExtensionIds = [
    'com.flatreality.workspace',
    'com.flatreality.workspace.access',
    'com.flatreality.workspace.skills',
    'com.flatreality.workspace.integrations',
    'com.flatreality.workspace.onboarding',
  ];
  for (const extensionId of deprecatedExtensionIds) {
    try {
      await graphRequest(`${userPath}/extensions/${encodeURIComponent(extensionId)}`, token, { method: 'DELETE' });
    } catch (error) {
      if (!(error instanceof Error) || !/not found|could not be found|Request_ResourceNotFound/i.test(error.message)) {
        warnings.push(`${extensionId}: ${error instanceof Error ? error.message : 'Microsoft Graph rejected extension cleanup.'}`);
      }
    }
  }

  for (const [field, value] of Object.entries(nativeFields)) {
    try {
      await graphRequest(userPath, token, { method: 'PATCH', body: JSON.stringify({ [field]: value }) });
      synchronizedFields += 1;
      patchedFields.set(field, value);
    } catch (error) {
      warnings.push(`${field}: ${error instanceof Error ? error.message : 'Microsoft Graph rejected the field.'}`);
    }
  }

  if (patchedFields.size) {
    const selectedFields = [...patchedFields.keys()];
    const remoteProfile = await graphRequest(
      `${userPath}?$select=${encodeURIComponent(['id', 'userPrincipalName', ...selectedFields].join(','))}`,
      token,
    ) as Record<string, unknown>;
    const comparable = (value: unknown) => value == null ? '' : String(value).trim();
    for (const [field, expected] of patchedFields) {
      if (comparable(remoteProfile[field]) !== comparable(expected)) {
        warnings.push(`${field}: Microsoft Graph accepted the update but read-back returned a different value.`);
      }
    }
  }

  for (const extension of extensions) {
    try {
      await graphRequest(`${userPath}/extensions/${encodeURIComponent(extension.id)}`, token, { method: 'PATCH', body: JSON.stringify(extension.data) });
      synchronizedFields += 1;
    } catch (error) {
      if (error instanceof Error && /not found|could not be found|Request_ResourceNotFound/i.test(error.message)) {
        try {
          await graphRequest(`${userPath}/extensions`, token, {
            method: 'POST',
            body: JSON.stringify({ '@odata.type': 'microsoft.graph.openTypeExtension', extensionName: extension.id, ...extension.data }),
          });
          synchronizedFields += 1;
        } catch (createError) {
          warnings.push(`${extension.id}: ${createError instanceof Error ? createError.message : 'Microsoft Graph rejected the extension.'}`);
        }
      } else {
        warnings.push(`${extension.id}: ${error instanceof Error ? error.message : 'Microsoft Graph rejected the extension.'}`);
      }
    }
  }

  if (!synchronizedFields) throw new Error(warnings.join(' | ') || 'Microsoft Graph rejected all profile fields.');
  return warnings;
}

async function syncChangedEntraMembers(before: WorkspaceState, after: WorkspaceState, actor: WorkspaceMember) {
  const previous = new Map(before.members.map((member) => [member.id, member]));
  const warnings: string[] = [];
  for (const member of after.members) {
    if (!member.entraEmail) continue;
    const oldMember = previous.get(member.id);
    if (oldMember && JSON.stringify(entraComparable(oldMember)) === JSON.stringify(entraComparable(member))) continue;
    try {
      const fieldWarnings = await syncMemberToEntra(member);
      await writeAuditLog({
        eventType: fieldWarnings.length ? 'identity.entra_sync_partial' : 'identity.entra_synced',
        actor,
        target: member,
        summary: fieldWarnings.length ? `${displayName(member)} was partially synchronized with Microsoft Entra ID.` : `${displayName(member)} was synchronized with Microsoft Entra ID.`,
        payload: {
          ...(fieldWarnings.length ? { warnings: fieldWarnings } : {}),
          verifiedNativeFields: Object.keys(entraComparable(member)).filter((field) => field !== 'extensions'),
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Microsoft Graph synchronization failed.';
      warnings.push(`${displayName(member)}: ${message}`);
      await writeAuditLog({ eventType: 'identity.entra_sync_failed', actor, target: member, summary: `Microsoft Entra sync failed for ${displayName(member)}.`, payload: { message } });
    }
  }
  return warnings;
}

async function syncAllEntraMembers(state: WorkspaceState) {
  const warnings: string[] = [];
  for (const member of state.members) {
    if (!member.entraEmail) continue;
    try {
      const memberWarnings = await syncMemberToEntra(member);
      warnings.push(...memberWarnings.map((warning) => `${displayName(member)}: ${warning}`));
    } catch (error) {
      warnings.push(`${displayName(member)}: ${error instanceof Error ? error.message : 'Microsoft Graph synchronization failed.'}`);
    }
  }
  return warnings;
}

async function syncAllUpworkData() {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upwork-oauth`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_ROLE_KEY}`, apikey: SERVICE_ROLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'internal_sync_all' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return [payload.error || `Upwork synchronization returned ${response.status}.`];
  return Array.isArray(payload.warnings) ? payload.warnings : [];
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
  const ignored = new Set(['passwordHash', 'lastSeenAt', 'entraObjectId']);
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
    ...diffCollection('file_project', before.fileProjects, after.fileProjects, actor, after.members),
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

function mergeUserFileProjects(previous: WorkspaceState['fileProjects'] = [], requested: WorkspaceState['fileProjects'] = []) {
  return previous.map((project) => {
    const requestedProject = requested.find((item) => item.id === project.id);
    if (!requestedProject) return project;
    const resources = Array.isArray(project.resources) ? project.resources : [];
    const requestedResources = Array.isArray(requestedProject.resources) ? requestedProject.resources : [];
    const resourceIds = new Set(resources.map((resource) => resource.id));
    const addedResources = requestedResources.filter((resource) => resource.id && !resourceIds.has(resource.id));
    return { ...project, resources: [...resources, ...addedResources] };
  });
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

async function createSession(member: WorkspaceMember, authMethod: 'legacy' | 'entra' | 'impersonation' = 'legacy') {
  const token = bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
  const tokenHash = await sha256Hex(token);
  const now = Date.now();
  const expiresAt = new Date(now + (authMethod === 'entra' ? ENTRA_MAX_HOURS * 60 * 60 * 1000 : SESSION_DAYS * 24 * 60 * 60 * 1000)).toISOString();
  const idleExpiresAt = authMethod === 'entra' ? new Date(now + ENTRA_IDLE_HOURS * 60 * 60 * 1000).toISOString() : null;
  const { error } = await supabase.from('workspace_sessions').insert({ token_hash: tokenHash, member_id: member.id, expires_at: expiresAt, idle_expires_at: idleExpiresAt, auth_method: authMethod, last_activity_at: new Date(now).toISOString() });
  if (error) throw error;
  return { token, memberId: member.id, expiresAt, authMethod };
}

async function actorFromToken(token: string) {
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const { data, error } = await supabase.from('workspace_sessions').select('member_id, expires_at, idle_expires_at, auth_method').eq('token_hash', tokenHash).maybeSingle();
  if (error) throw error;
  const now = new Date();
  if (!data || new Date(data.expires_at) < now || (data.auth_method === 'entra' && data.idle_expires_at && new Date(data.idle_expires_at) < now)) return null;
  const nextIdle = data.auth_method === 'entra'
    ? new Date(Math.min(Date.now() + ENTRA_IDLE_HOURS * 60 * 60 * 1000, new Date(data.expires_at).getTime())).toISOString()
    : null;
  await supabase.from('workspace_sessions').update({ last_activity_at: now.toISOString(), idle_expires_at: nextIdle }).eq('token_hash', tokenHash);
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
    fileProjects: mergeUserFileProjects(previous.fileProjects, requested.fileProjects),
  };
}

const RETAINER_BRIDGE_URL = 'https://yuballunxclgwdaqtbnz.supabase.co/functions/v1/retainer-workspace-bridge';
const retainerStatuses = new Set(['new', 'reviewing', 'contacted', 'proposal', 'won', 'lost', 'spam']);

function canManageRetainers(member: WorkspaceMember) {
  return Boolean(member.isAdmin || member.permissions?.includes('Operations'));
}

async function getRetainerBridgeToken() {
  const { data, error } = await supabase.rpc('get_retainer_workspace_bridge_token');
  if (error || !data) throw new Error('Retainer Plus bridge is not configured.');
  return String(data);
}

async function callRetainerBridge<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(RETAINER_BRIDGE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-retainer-bridge-token': await getRetainerBridgeToken() },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Retainer Plus bridge request failed.');
  return payload as T;
}

function rowToOffering(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''), type: String(row.type ?? 'specialist'), category: String(row.category ?? ''), title: String(row.title ?? ''),
    description: String(row.description ?? ''), tags: Array.isArray(row.tags) ? row.tags : [], roles: Array.isArray(row.roles) ? row.roles : [],
    published: Boolean(row.published), staffingRules: row.staffing_rules ?? {}, internalRateEur: row.internal_rate_eur === null ? null : Number(row.internal_rate_eur),
    availability: String(row.availability ?? 'unknown'), reasonCode: String(row.reason_code ?? ''), checkedAt: String(row.checked_at ?? ''), updatedAt: String(row.updated_at ?? ''),
  };
}

function inquiryFromBridge(row: Record<string, unknown>) {
  return {
    id: String(row.id ?? ''), reference: String(row.reference ?? ''), createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
    name: String(row.name ?? ''), organization: String(row.organization ?? ''), email: String(row.email ?? ''), projectUrl: String(row.project_url ?? ''),
    projectDescription: String(row.project_description ?? ''), selectedServices: Array.isArray(row.selected_services) ? row.selected_services : [],
    budgetRange: String(row.budget_range ?? ''), timeline: String(row.timeline ?? ''), status: String(row.status ?? 'new'),
    privacyAcknowledged: Boolean(row.privacy_acknowledged), privacyNoticeVersion: String(row.privacy_notice_version ?? ''), marketingConsent: Boolean(row.marketing_consent),
    configuration: row.retainer_configuration ?? {}, assigneeIds: Array.isArray(row.workspace_assignee_ids) ? row.workspace_assignee_ids : [],
  };
}

function availabilityForOffering(offering: Record<string, unknown>, state: WorkspaceState) {
  const rules = (offering.staffing_rules && typeof offering.staffing_rules === 'object' ? offering.staffing_rules : {}) as Record<string, unknown>;
  const requiredSkills = Array.isArray(rules.requiredSkills) ? rules.requiredSkills.map((item) => String(item).toLowerCase()) : [];
  const requiredRoles = Array.isArray(rules.requiredRoles) ? rules.requiredRoles.map((item) => String(item).toLowerCase()) : [];
  const candidates = state.members.filter((member) => member.benefitPrograms?.includes('FR Partners') && member.status !== 'suspended' && member.partnerStatus === 'available');
  const searchable = (member: WorkspaceMember) => [member.jobRole, member.seniority, member.software, member.languages, ...(member.skills ?? []), ...(member.endorsedSkills ?? [])].join(' ').toLowerCase();
  const matchesSkills = (member: WorkspaceMember) => requiredSkills.every((skill) => searchable(member).includes(skill));
  const type = String(offering.type ?? 'specialist');
  if (type === 'capacity') {
    return rules.confirmedReservableCapacity === true && candidates.some(matchesSkills)
      ? { availability: 'available', reason_code: 'confirmed_capacity' }
      : { availability: 'unavailable', reason_code: 'capacity_not_confirmed' };
  }
  if (type === 'team') {
    const roles = requiredRoles.length ? requiredRoles : (Array.isArray(offering.roles) ? offering.roles.map((item) => String(item).toLowerCase()) : []);
    if (!roles.length) return { availability: 'unknown', reason_code: 'staffing_rules_required' };
    const used = new Set<string>();
    const complete = roles.every((role) => {
      const candidate = candidates.find((member) => !used.has(member.id) && matchesSkills(member) && searchable(member).includes(role));
      if (candidate) used.add(candidate.id);
      return Boolean(candidate);
    });
    return complete ? { availability: 'available', reason_code: 'team_feasible' } : { availability: 'unavailable', reason_code: 'team_not_feasible' };
  }
  if (!requiredSkills.length && !requiredRoles.length) return { availability: 'unknown', reason_code: 'staffing_rules_required' };
  const match = candidates.some((member) => matchesSkills(member) && requiredRoles.every((role) => searchable(member).includes(role)));
  return match ? { availability: 'available', reason_code: 'specialist_assignable' } : { availability: 'unavailable', reason_code: 'specialist_unavailable' };
}

async function publishRetainerCatalogue(state: WorkspaceState) {
  const { data, error } = await supabase.from('workspace_retainer_catalogue').select('*').order('category').order('title');
  if (error) throw error;
  const now = new Date().toISOString();
  const rows = (data ?? []).map((row) => ({ ...row, ...availabilityForOffering(row, state), checked_at: now }));
  if (rows.length) {
    const { error: updateError } = await supabase.from('workspace_retainer_catalogue').upsert(rows, { onConflict: 'id' });
    if (updateError) throw updateError;
    await callRetainerBridge({ action: 'publish_catalogue', offerings: rows.map((row) => ({
      id: row.id, type: row.type, category: row.category, title: row.title, description: row.description, tags: row.tags, roles: row.roles,
      published: row.published, availability: row.availability, checkedAt: row.checked_at, reasonCode: row.reason_code,
    })) });
  }
  return rows;
}

async function retainerSnapshot(state: WorkspaceState) {
  const { data, error } = await supabase.from('workspace_retainer_catalogue').select('*').order('category').order('title');
  if (error) throw error;
  const bridge = await callRetainerBridge<{ inquiries?: Record<string, unknown>[] }>({ action: 'snapshot' });
  return {
    offerings: (data ?? []).map(rowToOffering),
    inquiries: (bridge.inquiries ?? []).map(inquiryFromBridge),
    partners: state.members.filter((member) => member.benefitPrograms?.includes('FR Partners')).map((member) => ({ id: member.id, name: displayName(member), jobRole: member.jobRole ?? '', seniority: member.seniority ?? '', partnerStatus: member.partnerStatus ?? 'inactive' })),
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  try {
    const body = await request.json();
    const action = String(body.action ?? '');

    if (action === 'scheduled_retainer_sync' && request.headers.get('Authorization') === `Bearer ${SERVICE_ROLE_KEY}`) {
      const state = await loadState();
      const actor = state.members.find((member) => member.isAdmin) ?? state.members[0];
      if (!actor) return json({ error: 'No Workspace administrator was found.' }, 404);
      await publishRetainerCatalogue(state);
      await writeAuditLog({ eventType: 'system.retainer_sync_completed', actor, summary: 'Scheduled Retainer Plus catalogue synchronization completed.' });
      return json({ ok: true });
    }

    if (action === 'scheduled_sync' && request.headers.get('Authorization') === `Bearer ${SERVICE_ROLE_KEY}`) {
      const state = await loadState();
      const actor = state.members.find((member) => member.isAdmin) ?? state.members[0];
      if (!actor) return json({ error: 'No Workspace administrator was found.' }, 404);
      const retainerWarnings: string[] = [];
      await publishRetainerCatalogue(state).catch((error) => retainerWarnings.push(error instanceof Error ? error.message : 'Retainer Plus catalogue synchronization failed.'));
      const profileWarnings = await syncAllEntraMembers(state);
      const reconciled = await reconcileAccessFromEntra(state, actor);
      const upworkWarnings = await syncAllUpworkData();
      const warnings = [...profileWarnings, ...reconciled.warnings, ...upworkWarnings, ...retainerWarnings];
      await writeAuditLog({
        eventType: warnings.length ? 'system.scheduled_sync_partial' : 'system.scheduled_sync_completed',
        actor,
        summary: 'Scheduled Workspace, Entra, GitHub and Upwork synchronization completed.',
        payload: { warnings },
      });
      return json({ ok: true, warnings });
    }

    if (action === 'login') {
      let state = await loadState();
      const employmentId = String(body.employmentId ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const member = state.members.find((item) => item.employmentId.toLowerCase() === employmentId);
      if (!member) return json({ error: 'Employment ID or password is incorrect.' }, 401);
      if (member.allowLegacyLogin === false) return json({ error: 'Legacy sign-in is disabled for this account. Use Microsoft Entra ID.' }, 403);
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

    if (action === 'entra_login') {
      const authorization = request.headers.get('Authorization') ?? '';
      const accessToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
      if (!accessToken) return json({ error: 'Microsoft session was not provided.' }, 401);

      const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
      const authUser = authData?.user;
      if (authError || !authUser) return json({ error: 'Microsoft session is invalid or expired.' }, 401);

      const providers = Array.isArray(authUser.app_metadata?.providers) ? authUser.app_metadata.providers : [];
      const azureIdentity = authUser.identities?.find((identity) => identity.provider === 'azure');
      if (authUser.app_metadata?.provider !== 'azure' && !providers.includes('azure') && !azureIdentity) {
        return json({ error: 'This account was not authenticated through Microsoft Entra ID.' }, 403);
      }

      const entraEmail = normalizeEmail(authUser.email);
      if (!isAllowedEntraEmail(entraEmail)) {
        return json({ error: 'Use a Flat Reality Microsoft account to sign in.' }, 403);
      }

      const identityData = (azureIdentity?.identity_data ?? {}) as Record<string, unknown>;
      const userMetadata = (authUser.user_metadata ?? {}) as Record<string, unknown>;
      const identityClaims = (identityData.custom_claims ?? {}) as Record<string, unknown>;
      const userClaims = (userMetadata.custom_claims ?? {}) as Record<string, unknown>;
      let entraObjectId = String(
        identityData.oid ?? identityClaims.oid ?? userMetadata.oid ?? userClaims.oid ?? '',
      ).trim();
      if (!entraObjectId) {
        const graphToken = await getGraphAccessToken();
        const graphUserResponse = await fetch(
          `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(entraEmail)}?$select=id`,
          { headers: { Authorization: `Bearer ${graphToken}` } },
        );
        if (graphUserResponse.ok) {
          const graphUser = await graphUserResponse.json().catch(() => ({}));
          entraObjectId = String(graphUser?.id ?? '').trim();
        }
      }
      if (!entraObjectId) {
        entraObjectId = String(
          identityData.provider_id
            ?? userMetadata.provider_id
            ?? identityData.sub
            ?? userMetadata.sub
            ?? azureIdentity?.provider_id
            ?? '',
        ).trim();
      }
      if (!entraObjectId) return json({ error: 'Microsoft did not return a stable Entra identity.' }, 403);

      let state = await loadState();
      let member = state.members.find((item) => item.entraObjectId === entraObjectId);
      if (!member) {
        const emailMatches = state.members.filter((item) => normalizeEmail(item.entraEmail || item.workEmail) === entraEmail);
        if (emailMatches.length !== 1) {
          return json({ error: 'No Workspace profile is assigned to this Entra ID email. Contact your manager.' }, 403);
        }
        member = emailMatches[0];
        if (member.entraObjectId && member.entraObjectId !== entraObjectId) {
          return json({ error: 'This Workspace profile is already linked to another Entra identity.' }, 409);
        }
      }

      const wasLinked = Boolean(member.entraObjectId);
      const firstLink = !wasLinked || !member.entraSetupCompleted;
      const linkedMember = { ...member, entraEmail, entraObjectId, workEmail: undefined };
      state = {
        ...state,
        members: state.members.map((item) => (item.id === linkedMember.id ? linkedMember : item)),
      };
      const { error: stateError } = await supabase.from('workspace_state').upsert({ id: STATE_ID, state, updated_at: new Date().toISOString() });
      if (stateError) throw stateError;

      const session = await createSession(linkedMember, 'entra');
      state = await touchMemberLastSeen(state, linkedMember.id);
      if (!wasLinked) {
        await writeAuditLog({ eventType: 'identity.entra_linked', actor: linkedMember, target: linkedMember, summary: `${displayName(linkedMember)} linked a Microsoft Entra identity.` });
      }
      await writeAuditLog({ eventType: 'session.entra_login', actor: linkedMember, target: linkedMember, summary: `${displayName(linkedMember)} signed in with Microsoft Entra ID.` });
      return json({ session, state: scrubState(state, { ...linkedMember, lastSeenAt: new Date().toISOString() }), firstLink });
    }

    if (action === 'recovery_options') {
      const state = await loadState();
      const employmentId = String(body.employmentId ?? '').trim().toLowerCase();
      const member = state.members.find((item) => item.employmentId.toLowerCase() === employmentId);
      if (!member || member.allowLegacyLogin === false || (await getCredential(member))) {
        return json({ error: 'Recovery wizard cannot be used with these details. Contact your manager for manual recovery.' }, 403);
      }
      return json({ ok: true });
    }

    if (action === 'recover') {
      const state = await loadState();
      const employmentId = String(body.employmentId ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const member = state.members.find((item) => item.employmentId.toLowerCase() === employmentId);
      if (!member || member.allowLegacyLogin === false || (await getCredential(member))) {
        return json({ error: 'Recovery wizard cannot be used with these details. Contact your manager for manual recovery.' }, 403);
      }
      if (password.length < 10) return json({ error: 'Password must contain at least 10 characters.' }, 400);
      await setCredential(member, await hashPassword(password));
      return json({ ok: true });
    }

    const context = await actorFromToken(String(body.sessionToken ?? ''));
    if (!context) return json({ error: 'Session is invalid or expired.' }, 401);

    if (action === 'retainer_snapshot') {
      if (!canManageRetainers(context.actor)) return json({ error: 'Admin or Operations access is required.' }, 403);
      return json(await retainerSnapshot(context.state));
    }

    if (action === 'retainer_save_offering') {
      if (!canManageRetainers(context.actor)) return json({ error: 'Admin or Operations access is required.' }, 403);
      const offering = body.offering as Record<string, unknown>;
      const id = String(offering?.id ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 100);
      const type = String(offering?.type ?? '');
      if (!id || !['specialist', 'team', 'capacity'].includes(type)) return json({ error: 'A valid offering ID and type are required.' }, 400);
      const row = {
        id, type, category: String(offering.category ?? '').trim().slice(0, 120), title: String(offering.title ?? '').trim().slice(0, 160),
        description: String(offering.description ?? '').trim().slice(0, 2000),
        tags: Array.isArray(offering.tags) ? offering.tags.map(String).slice(0, 30) : [], roles: Array.isArray(offering.roles) ? offering.roles.map(String).slice(0, 30) : [],
        published: Boolean(offering.published), staffing_rules: offering.staffingRules && typeof offering.staffingRules === 'object' ? offering.staffingRules : {},
        internal_rate_eur: offering.internalRateEur === null || offering.internalRateEur === '' ? null : Number(offering.internalRateEur),
        updated_by: context.actor.id, updated_at: new Date().toISOString(),
      };
      if (!row.category || !row.title) return json({ error: 'Category and title are required.' }, 400);
      const { error } = await supabase.from('workspace_retainer_catalogue').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      await publishRetainerCatalogue(context.state);
      await writeAuditLog({ eventType: row.published ? 'retainer.catalogue_published' : 'retainer.catalogue_saved', actor: context.actor, summary: `${displayName(context.actor)} updated Retainer Plus offering ${row.title}.`, payload: { offeringId: id, published: row.published } });
      return json(await retainerSnapshot(context.state));
    }

    if (action === 'retainer_update_inquiry') {
      if (!canManageRetainers(context.actor)) return json({ error: 'Admin or Operations access is required.' }, 403);
      const inquiryId = String(body.inquiryId ?? '');
      const status = String(body.status ?? '');
      const assigneeIds = Array.isArray(body.assigneeIds) ? [...new Set(body.assigneeIds.map(String))] : [];
      if (!inquiryId || !retainerStatuses.has(status)) return json({ error: 'A valid inquiry and status are required.' }, 400);
      const allowedIds = new Set(context.state.members.filter((member) => member.benefitPrograms?.includes('FR Partners')).map((member) => member.id));
      if (assigneeIds.some((id) => !allowedIds.has(id))) return json({ error: 'Only Partners™ members can be assigned.' }, 400);
      await callRetainerBridge({ action: 'update_inquiry', inquiryId, status, assigneeIds });
      const { error: deleteError } = await supabase.from('workspace_retainer_assignments').delete().eq('inquiry_id', inquiryId);
      if (deleteError) throw deleteError;
      if (assigneeIds.length) {
        const { error: insertError } = await supabase.from('workspace_retainer_assignments').insert(assigneeIds.map((memberId) => ({ inquiry_id: inquiryId, member_id: memberId, created_by: context.actor.id })));
        if (insertError) throw insertError;
      }
      await writeAuditLog({ eventType: 'retainer.inquiry_updated', actor: context.actor, summary: `${displayName(context.actor)} updated Retainer Plus inquiry ${inquiryId}.`, payload: { inquiryId, status, assigneeIds } });
      return json(await retainerSnapshot(context.state));
    }

    if (action === 'complete_entra_setup') {
      const preferredName = String(body.preferredName ?? '').trim().slice(0, 80);
      const linkedMember = context.state.members.find((member) => member.id === context.actor.id);
      if (!linkedMember?.entraObjectId || !isAllowedEntraEmail(linkedMember.entraEmail || '')) {
        return json({ error: 'A linked Microsoft Entra identity is required.' }, 403);
      }
      const nextMember = { ...linkedMember, preferredName, entraSetupCompleted: true };
      const nextState = {
        ...context.state,
        members: context.state.members.map((member) => (member.id === nextMember.id ? nextMember : member)),
      };
      const { error } = await supabase.from('workspace_state').upsert({ id: STATE_ID, state: nextState, updated_at: new Date().toISOString() });
      if (error) throw error;
      await syncMemberToEntra(nextMember).catch(async (syncError) => {
        await writeAuditLog({ eventType: 'identity.entra_sync_failed', actor: nextMember, target: nextMember, summary: `Microsoft Entra sync failed for ${displayName(nextMember)}.`, payload: { message: syncError instanceof Error ? syncError.message : 'Microsoft Graph synchronization failed.' } });
      });
      await writeAuditLog({ eventType: 'identity.entra_setup_completed', actor: nextMember, target: nextMember, summary: `${displayName(nextMember)} completed Microsoft Entra account linking.` });
      return json({ state: scrubState(nextState, nextMember) });
    }

    if (action === 'entra_avatar') {
      const memberId = String(body.memberId ?? context.actor.id);
      if (memberId !== context.actor.id && !context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const target = context.state.members.find((member) => member.id === memberId);
      const userId = String(target?.entraObjectId || target?.entraEmail || '').trim();
      if (!target || !userId) return json({ dataUrl: '' });
      const graphToken = await getGraphAccessToken();
      const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/photo/$value`, { headers: { Authorization: `Bearer ${graphToken}` } });
      if (response.status === 404) return json({ dataUrl: '' });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || 'Microsoft profile photo could not be loaded.');
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength > 2 * 1024 * 1024) return json({ dataUrl: '' });
      return json({ dataUrl: `data:${response.headers.get('content-type') || 'image/jpeg'};base64,${bytesToBase64(bytes)}` });
    }

    if (action === 'entra_devices') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const memberId = String(body.memberId ?? '');
      const target = context.state.members.find((member) => member.id === memberId);
      const userId = String(target?.entraObjectId || target?.entraEmail || '').trim();
      if (!target || !userId) return json({ devices: [] });
      const graphToken = await getGraphAccessToken();
      const fields = 'id,deviceId,displayName,operatingSystem,operatingSystemVersion,trustType,accountEnabled,isManaged,isCompliant,approximateLastSignInDateTime,registrationDateTime';
      const payload = await graphRequest(`/users/${encodeURIComponent(userId)}/registeredDevices/microsoft.graph.device?$select=${fields}`, graphToken);
      return json({ devices: Array.isArray(payload?.value) ? payload.value : [] });
    }

    if (action === 'sync_entra_profile') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const memberId = String(body.memberId ?? '');
      const target = context.state.members.find((member) => member.id === memberId);
      if (!target?.entraEmail) return json({ error: 'This profile does not have an Entra ID email.' }, 400);
      const warnings = await syncMemberToEntra(target);
      await writeAuditLog({
        eventType: warnings.length ? 'identity.entra_sync_partial' : 'identity.entra_synced',
        actor: context.actor,
        target,
        summary: warnings.length ? `${displayName(target)} was partially synchronized with Microsoft Entra ID.` : `${displayName(target)} was synchronized with Microsoft Entra ID.`,
        payload: {
          ...(warnings.length ? { warnings } : {}),
          verifiedNativeFields: Object.keys(entraComparable(target)).filter((field) => field !== 'extensions'),
        },
      });
      return json({ ok: true, warnings });
    }

    if (action === 'reconcile_access_from_entra') {
      if (!context.actor.isAdmin) return json({ error: 'Admin access is required.' }, 403);
      const result = await reconcileAccessFromEntra(context.state, context.actor);
      const actor = result.state.members.find((member) => member.id === context.actor.id) ?? context.actor;
      return json({ state: scrubState(result.state, actor), warnings: result.warnings });
    }

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
      const session = await createSession(target, 'impersonation');
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
      const entraValidationError = validateEntraProfiles(nextState);
      if (entraValidationError) return json({ error: entraValidationError }, 400);
      const { error } = await supabase.from('workspace_state').upsert({ id: STATE_ID, state: nextState, updated_at: new Date().toISOString() });
      if (error) throw error;
      await auditStateChanges(context.state, nextState, context.actor);
      const entraSyncWarnings = context.actor.isAdmin ? await syncChangedEntraMembers(context.state, nextState, context.actor) : [];
      const accessSyncWarnings = context.actor.isAdmin ? await syncChangedAccessGroups(context.state, nextState, context.actor) : [];
      return json({ state: scrubState(nextState, context.actor), entraSyncWarnings: [...entraSyncWarnings, ...accessSyncWarnings] });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
  }
});
