import { emptyMember, initialGuidePages, initialLevels, initialMembers, initialRewards, initialWorkRecords } from './data';
import { supabase } from './supabase';
import type { AuditLogEntry, ScheduleDayCompletion, ScheduleShift, WorkspaceMember, WorkspaceState } from './types';

const STORAGE_KEY = 'flat-reality-workspace-state';

export type WorkspaceSession = {
  token?: string;
  memberId?: string;
  expiresAt?: string | number;
};

export const defaultWorkspaceState: WorkspaceState = {
  members: initialMembers,
  levels: initialLevels,
  rewards: initialRewards,
  guidePages: initialGuidePages,
  workRecords: initialWorkRecords,
  scheduleShifts: [],
  scheduleCompletions: [],
};

function normalizeMember(member: Partial<WorkspaceMember>): WorkspaceMember {
  return {
    ...emptyMember,
    ...member,
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
  };
}

async function callWorkspaceApi<T>(payload: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.functions.invoke('workspace-api', { body: payload });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function loginWorkspace(employmentId: string, password: string): Promise<{ session: WorkspaceSession; state: WorkspaceState }> {
  const response = await callWorkspaceApi<{ session: WorkspaceSession; state: Partial<WorkspaceState> }>({ action: 'login', employmentId, password });
  return { session: response.session, state: normalizeWorkspaceState(response.state) };
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
