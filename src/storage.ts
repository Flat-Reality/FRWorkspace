import { initialGuidePages, initialLevels, initialMembers, initialRewards } from './data';
import { supabase } from './supabase';
import type { WorkspaceState } from './types';

const STORAGE_KEY = 'flat-reality-workspace-state';
const SUPABASE_STATE_ID = 'workspace';

export const defaultWorkspaceState: WorkspaceState = {
  members: initialMembers,
  levels: initialLevels,
  rewards: initialRewards,
  guidePages: initialGuidePages,
};

function normalizeWorkspaceState(state: Partial<WorkspaceState>): WorkspaceState {
  return {
    members: state.members?.length ? state.members : defaultWorkspaceState.members,
    levels: state.levels?.length ? state.levels : defaultWorkspaceState.levels,
    rewards: state.rewards ?? defaultWorkspaceState.rewards,
    guidePages: state.guidePages?.length ? state.guidePages : defaultWorkspaceState.guidePages,
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
