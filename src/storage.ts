import { emptyMember, initialGuidePages, initialLevels, initialMembers, initialRewards, initialWorkRecords } from './data';
import { supabase } from './supabase';
import type { ScheduleDayCompletion, ScheduleShift, WorkspaceMember, WorkspaceState } from './types';

const STORAGE_KEY = 'flat-reality-workspace-state';
const SUPABASE_STATE_ID = 'workspace';

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
    withheldBalance: Number(member.withheldBalance ?? 0),
    strikeSystem: Number(member.strikeSystem ?? 0),
    xp: Number(member.xp ?? 0),
    statusUntil: member.statusUntil ?? '',
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

function normalizeWorkspaceState(state: Partial<WorkspaceState>): WorkspaceState {
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

export async function loadWorkspaceState(): Promise<WorkspaceState> {
  if (supabase) {
    const { data, error } = await supabase
      .from('workspace_state')
      .select('state')
      .eq('id', SUPABASE_STATE_ID)
      .maybeSingle();

    if (!error && data?.state) {
      return normalizeWorkspaceState(data.state as Partial<WorkspaceState>);
    }
  }

  const localState = window.localStorage.getItem(STORAGE_KEY);
  if (!localState) return defaultWorkspaceState;

  try {
    return normalizeWorkspaceState(JSON.parse(localState) as Partial<WorkspaceState>);
  } catch {
    return defaultWorkspaceState;
  }
}

export async function saveWorkspaceState(state: WorkspaceState) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

  if (!supabase) return;

  const { error } = await supabase
    .from('workspace_state')
    .upsert({ id: SUPABASE_STATE_ID, state, updated_at: new Date().toISOString() });

  if (error) {
    throw error;
  }
}
