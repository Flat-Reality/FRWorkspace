import { emptyMember, initialFileProjects, initialGuidePages, initialLevels, initialMembers, initialRewards, initialWorkRecords } from './data';
import { supabase } from './supabase';
import type { AuditLogEntry, EntraDevice, FileProject, FileResource, GitHubSnapshot, RetainerOffering, RetainerSnapshot, ScheduleDayCompletion, ScheduleShift, UpworkContractDraft, UpworkSnapshot, WorkspaceMember, WorkspaceState } from './types';

const STORAGE_KEY = 'flat-reality-workspace-state';

export type WorkspaceSession = {
  token?: string;
  memberId?: string;
  expiresAt?: string | number;
  authMethod?: 'legacy' | 'entra' | 'impersonation';
};

export const defaultWorkspaceState: WorkspaceState = {
  members: initialMembers,
  levels: initialLevels,
  rewards: initialRewards,
  guidePages: initialGuidePages,
  workRecords: initialWorkRecords,
  scheduleShifts: [],
  scheduleCompletions: [],
  fileProjects: initialFileProjects,
};

function normalizeMember(member: Partial<WorkspaceMember>): WorkspaceMember {
  const legacyMember = member as Partial<WorkspaceMember> & { workEmail?: string };
  const { workEmail: legacyWorkEmail, ...memberWithoutLegacyWorkEmail } = legacyMember;
  return {
    ...emptyMember,
    ...memberWithoutLegacyWorkEmail,
    entraEmail: member.entraEmail ?? legacyWorkEmail ?? '',
    entraObjectId: member.entraObjectId ?? '',
    entraSetupCompleted: Boolean(member.entraSetupCompleted),
    onboarding: {
      ...emptyMember.onboarding,
      ...(member.onboarding ?? {}),
    },
    documents: member.documents ?? [],
    issuedRewardIds: member.issuedRewardIds ?? [],
    benefitPrograms: member.benefitPrograms ?? [],
    upworkUrl: member.upworkUrl ?? '',
    rate: member.rate ?? '',
    partnerStatus: member.partnerStatus ?? 'available',
    partnerIndex: Number(member.partnerIndex ?? 100),
    completedTasks: Number(member.completedTasks ?? 0),
    withheldBalance: Number(member.withheldBalance ?? 0),
    strikeSystem: Number(member.strikeSystem ?? 0),
    xp: Number(member.xp ?? 0),
    statusUntil: member.statusUntil ?? '',
    lastSeenAt: member.lastSeenAt ?? '',
    passwordHash: member.passwordHash ?? '',
    scheduleEnabled: Boolean(member.scheduleEnabled),
    githubConnected: Boolean(member.githubConnected),
    githubUsername: member.githubUsername ?? '',
    githubUserId: member.githubUserId ?? '',
    githubAvatarUrl: member.githubAvatarUrl ?? '',
    githubProfileUrl: member.githubProfileUrl ?? '',
    steamConnected: Boolean(member.steamConnected),
    steamId: member.steamId ?? '',
    steamProfileUrl: member.steamProfileUrl ?? '',
  };
}

function normalizeShift(shift: Partial<ScheduleShift>): ScheduleShift {
  return {
    id: shift.id ?? `shift-${Date.now()}`,
    memberId: shift.memberId ?? '',
    weekStart: shift.weekStart ?? '',
    dayIndex: Number(shift.dayIndex ?? 0),
    startTime: shift.startTime ?? '09:00',
    endTime: shift.endTime ?? '17:00',
  };
}

function normalizeCompletion(completion: Partial<ScheduleDayCompletion>): ScheduleDayCompletion {
  return {
    id: completion.id ?? `completion-${Date.now()}`,
    memberId: completion.memberId ?? '',
    weekStart: completion.weekStart ?? '',
    dayIndex: Number(completion.dayIndex ?? 0),
    actualHours: Number(completion.actualHours ?? 0),
    completedAt: completion.completedAt ?? '',
  };
}

function normalizeFileResource(resource: Partial<FileResource>): FileResource {
  return {
    id: resource.id ?? `file-${Date.now()}`,
    title: resource.title ?? 'Untitled file',
    url: resource.url ?? '',
    type: resource.type === 'GitHub resource' ? 'GitHub resource' : 'Document file',
  };
}

function normalizeFileProject(project: Partial<FileProject>): FileProject {
  return {
    id: project.id ?? `project-${Date.now()}`,
    name: project.name ?? 'Project',
    resources: project.resources?.map(normalizeFileResource) ?? [],
  };
}

export function normalizeWorkspaceState(state: Partial<WorkspaceState>): WorkspaceState {
  const members = state.members?.length ? state.members.map(normalizeMember) : defaultWorkspaceState.members;

  return {
    members,
    levels: state.levels?.length ? state.levels : defaultWorkspaceState.levels,
    rewards: state.rewards ?? defaultWorkspaceState.rewards,
    guidePages: state.guidePages?.length ? state.guidePages : defaultWorkspaceState.guidePages,
    workRecords: state.workRecords?.length ? state.workRecords : defaultWorkspaceState.workRecords,
    scheduleShifts: state.scheduleShifts?.map(normalizeShift) ?? [],
    scheduleCompletions: state.scheduleCompletions?.map(normalizeCompletion) ?? [],
    fileProjects: state.fileProjects?.length ? state.fileProjects.map(normalizeFileProject) : defaultWorkspaceState.fileProjects,
  };
}

async function callWorkspaceApi<T>(payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('workspace-api', { body: payload });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.json() as { error?: unknown };
        if (typeof responseBody.error === 'string' && responseBody.error.trim()) message = responseBody.error;
      } catch {
        // Keep the transport error when the function did not return JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

async function callUpworkApi<T>(payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('upwork-oauth', { body: payload });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.json() as { error?: unknown };
        if (typeof responseBody.error === 'string' && responseBody.error.trim()) message = responseBody.error;
      } catch {
        // Keep the transport error when the function did not return JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

async function callGitHubApi<T>(payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('github-integration', { body: payload });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.json() as { error?: unknown };
        if (typeof responseBody.error === 'string' && responseBody.error.trim()) message = responseBody.error;
      } catch {
        // Keep the transport error when the function did not return JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

async function callSteamApi<T>(payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('steam-integration', { body: payload });
  if (error) {
    let message = error.message;
    const context = (error as { context?: Response }).context;
    if (context) {
      try {
        const responseBody = await context.json() as { error?: unknown };
        if (typeof responseBody.error === 'string' && responseBody.error.trim()) message = responseBody.error;
      } catch {
        // Keep the transport error when the function did not return JSON.
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function getGitHubSnapshot(sessionToken: string, memberId?: string): Promise<GitHubSnapshot> {
  const response = await callGitHubApi<{ snapshot: GitHubSnapshot }>({ action: 'snapshot', sessionToken, memberId });
  return response.snapshot;
}

export async function connectGitHub(sessionToken: string): Promise<void> {
  const returnUrl = new URL(window.location.href);
  returnUrl.search = '';
  returnUrl.hash = '#/profile';
  const response = await callGitHubApi<{ authorizationUrl: string }>({ action: 'connect', sessionToken, returnUrl: returnUrl.toString() });
  window.location.assign(response.authorizationUrl);
}

export async function syncGitHubAccess(sessionToken: string, memberId?: string): Promise<GitHubSnapshot> {
  const response = await callGitHubApi<{ snapshot: GitHubSnapshot }>({ action: 'sync_access', sessionToken, memberId });
  return response.snapshot;
}

export async function disconnectGitHub(sessionToken: string, memberId?: string): Promise<void> {
  await callGitHubApi({ action: 'disconnect', sessionToken, memberId });
}

export async function getSteamSnapshot(sessionToken: string, memberId?: string): Promise<import('./types').SteamSnapshot> {
  const response = await callSteamApi<{ snapshot: import('./types').SteamSnapshot }>({ action: 'snapshot', sessionToken, memberId });
  return response.snapshot;
}

export async function connectSteam(sessionToken: string): Promise<void> {
  const returnUrl = new URL(window.location.href);
  returnUrl.search = '';
  returnUrl.hash = '#/profile';
  const response = await callSteamApi<{ authorizationUrl: string }>({ action: 'connect', sessionToken, returnUrl: returnUrl.toString() });
  window.location.assign(response.authorizationUrl);
}

export async function disconnectSteam(sessionToken: string, memberId?: string): Promise<void> {
  await callSteamApi({ action: 'disconnect', sessionToken, memberId });
}

export async function getUpworkSnapshot(sessionToken: string, memberId?: string, force = false): Promise<UpworkSnapshot> {
  const response = await callUpworkApi<{ snapshot: UpworkSnapshot }>({ action: 'snapshot', sessionToken, memberId, force });
  return response.snapshot;
}

export async function connectUpwork(sessionToken: string): Promise<void> {
  const returnUrl = new URL(window.location.href);
  returnUrl.search = '';
  returnUrl.hash = '';
  const response = await callUpworkApi<{ authorizationUrl: string }>({ action: 'connect', sessionToken, returnUrl: returnUrl.toString() });
  window.location.assign(response.authorizationUrl);
}

export async function disconnectUpwork(sessionToken: string, memberId?: string): Promise<void> {
  await callUpworkApi({ action: 'disconnect', sessionToken, memberId });
}

export async function createUpworkContract(sessionToken: string, draft: UpworkContractDraft): Promise<UpworkSnapshot> {
  const response = await callUpworkApi<{ snapshot: UpworkSnapshot }>({ action: 'create_contract', sessionToken, draft });
  return response.snapshot;
}

export async function loginWorkspace(employmentId: string, password: string): Promise<{ session: WorkspaceSession; state: WorkspaceState }> {
  const response = await callWorkspaceApi<{ session: WorkspaceSession; state: Partial<WorkspaceState> }>({ action: 'login', employmentId, password });
  return { session: response.session, state: normalizeWorkspaceState(response.state) };
}

export async function startEntraLogin(): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured.');
  window.sessionStorage.setItem('flat-reality-workspace-entra-pending', '1');
  window.localStorage.setItem('flat-reality-workspace-entra-pending', '1');
  const redirectUrl = new URL(window.location.href);
  redirectUrl.search = '';
  redirectUrl.hash = '';
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'azure',
    options: {
      scopes: 'email',
      redirectTo: redirectUrl.toString(),
    },
  });
  if (error) {
    window.sessionStorage.removeItem('flat-reality-workspace-entra-pending');
    window.localStorage.removeItem('flat-reality-workspace-entra-pending');
    throw error;
  }
}

async function waitForEntraAuthSession() {
  if (!supabase) return null;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (data.session?.access_token) return data.session;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return null;
}

export async function getEntraWorkspaceLogin(): Promise<{ session: WorkspaceSession; state: WorkspaceState; firstLink: boolean } | null> {
  if (!supabase) return null;
  const session = await waitForEntraAuthSession();
  if (!session?.access_token) return null;
  const response = await callWorkspaceApi<{ session: WorkspaceSession; state: Partial<WorkspaceState>; firstLink?: boolean }>({ action: 'entra_login' });
  return { session: response.session, state: normalizeWorkspaceState(response.state), firstLink: Boolean(response.firstLink) };
}

export async function completeEntraSetup(sessionToken: string, preferredName: string): Promise<WorkspaceState> {
  const response = await callWorkspaceApi<{ state: Partial<WorkspaceState> }>({ action: 'complete_entra_setup', sessionToken, preferredName });
  return normalizeWorkspaceState(response.state);
}

export async function getEntraAvatar(sessionToken: string, memberId?: string): Promise<string> {
  const response = await callWorkspaceApi<{ dataUrl?: string }>({ action: 'entra_avatar', sessionToken, memberId });
  return response.dataUrl ?? '';
}

export async function getEntraDevices(sessionToken: string, memberId: string): Promise<EntraDevice[]> {
  const response = await callWorkspaceApi<{ devices?: EntraDevice[] }>({ action: 'entra_devices', sessionToken, memberId });
  return response.devices ?? [];
}

export async function syncEntraProfile(sessionToken: string, memberId: string): Promise<string[]> {
  const response = await callWorkspaceApi<{ warnings?: string[] }>({ action: 'sync_entra_profile', sessionToken, memberId });
  return response.warnings ?? [];
}

export async function reconcileAccessFromEntra(sessionToken: string): Promise<{ state: WorkspaceState; warnings: string[] }> {
  const response = await callWorkspaceApi<{ state: Partial<WorkspaceState>; warnings?: string[] }>({ action: 'reconcile_access_from_entra', sessionToken });
  return { state: normalizeWorkspaceState(response.state), warnings: response.warnings ?? [] };
}

export async function signOutEntra(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function checkRecoveryOptions(employmentId: string): Promise<void> {
  await callWorkspaceApi({ action: 'recovery_options', employmentId });
}

export async function recoverWorkspacePassword(employmentId: string, password: string): Promise<void> {
  await callWorkspaceApi({ action: 'recover', employmentId, password });
}

export async function resetWorkspacePassword(sessionToken: string, memberId: string): Promise<void> {
  await callWorkspaceApi({ action: 'reset_password', sessionToken, memberId });
}

export async function impersonateWorkspaceMember(sessionToken: string, memberId: string): Promise<{ session: WorkspaceSession; state: WorkspaceState }> {
  const response = await callWorkspaceApi<{ session: WorkspaceSession; state: Partial<WorkspaceState> }>({ action: 'impersonate', sessionToken, memberId });
  return { session: response.session, state: normalizeWorkspaceState(response.state) };
}

export async function listWorkspaceAuditLogs(sessionToken: string, limit = 200): Promise<AuditLogEntry[]> {
  const response = await callWorkspaceApi<{ logs: AuditLogEntry[] }>({ action: 'list_logs', sessionToken, limit });
  return response.logs ?? [];
}

export async function getRetainerSnapshot(sessionToken: string): Promise<RetainerSnapshot> {
  return callWorkspaceApi<RetainerSnapshot>({ action: 'retainer_snapshot', sessionToken });
}

export async function saveRetainerOffering(sessionToken: string, offering: RetainerOffering): Promise<RetainerSnapshot> {
  return callWorkspaceApi<RetainerSnapshot>({ action: 'retainer_save_offering', sessionToken, offering });
}

export async function updateRetainerInquiry(sessionToken: string, inquiryId: string, status: string, assigneeIds: string[]): Promise<RetainerSnapshot> {
  return callWorkspaceApi<RetainerSnapshot>({ action: 'retainer_update_inquiry', sessionToken, inquiryId, status, assigneeIds });
}

export async function loadWorkspaceState(sessionToken?: string): Promise<WorkspaceState> {
  if (supabase && sessionToken) {
    const response = await callWorkspaceApi<{ state: Partial<WorkspaceState> }>({ action: 'load', sessionToken });
    return normalizeWorkspaceState(response.state);
  }

  if (supabase && !sessionToken) {
    return defaultWorkspaceState;
  }

  const localState = window.localStorage.getItem(STORAGE_KEY);
  if (!localState) return defaultWorkspaceState;

  try {
    return normalizeWorkspaceState(JSON.parse(localState) as Partial<WorkspaceState>);
  } catch {
    return defaultWorkspaceState;
  }
}

export async function saveWorkspaceState(state: WorkspaceState, sessionToken?: string) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (!supabase || !sessionToken) return;

  await callWorkspaceApi({ action: 'save', sessionToken, state });
}
