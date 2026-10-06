create table if not exists public.workspace_access_groups (
  group_key text primary key,
  display_name text not null unique,
  group_kind text not null check (group_kind in ('account_type', 'role', 'creative', 'project')),
  workspace_value text not null,
  entra_group_id uuid not null unique,
  github_team_slug text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.workspace_access_groups
  (group_key, display_name, group_kind, workspace_value, entra_group_id, github_team_slug)
values
  ('administration', 'Administration', 'role', 'Admin', '44b21558-be01-48f5-86ee-dd7c1cb07d0c', 'administration'),
  ('community', 'Community', 'role', 'Community', 'cb3ce791-7ebe-49bc-92ba-9170a33e1c31', 'community'),
  ('core_team', 'CORE TEAM', 'account_type', 'CORE TEAM', 'eba64b34-5ea2-4b6a-8e8b-4689106085b8', 'core-team'),
  ('creative_artists', 'Creative/Artists', 'creative', 'Art', '2eb946f6-33de-44ba-8e56-ecf179cfdc63', 'creative-artists'),
  ('creative_audio', 'Creative/Audio Pofessionals', 'creative', 'Music|Sound Design', 'cda1c20b-2130-471f-bc59-999a53e72a0f', 'creative-audio-pofessionals'),
  ('creative_game_designers', 'Creative/Game Designers', 'creative', 'Game & Level Design', '983147fa-7a74-446c-8734-bc0055713cf3', 'creative-game-designers'),
  ('developers', 'Developers', 'role', 'Developer', '401aa23c-b616-4034-8c04-ae4aaceba8be', 'developers'),
  ('hr', 'HR', 'role', 'HR', '442c44ad-06e9-4add-a4d7-8fe7342ae6f2', 'hr'),
  ('independent_partner', 'INDEPENDENT PARTNER', 'account_type', 'INDEPENDENT PARTNER', '87a5785a-217c-499e-ba3c-a132071746d2', 'independent-partner'),
  ('operations', 'Operations', 'role', 'Operations', '92dfddc6-10de-4aad-ba63-10e0459e187a', 'operations'),
  ('project_partners', 'Partners™ (Project)', 'project', 'FR Partners', 'f4746285-e294-439f-9e6a-158ae78c7b0f', 'partners-project'),
  ('project_rain_heart', 'RAIN HEART (Project)', 'project', 'RAIN HEART', '7299330b-d012-426c-9666-c0f93b74dba5', 'rain-heart-project'),
  ('project_the_nick', 'The Nick (Project)', 'project', 'The Nick', '342ad90e-a69a-4662-8929-bc739d437511', 'the-nick-project')
on conflict (group_key) do update set
  display_name = excluded.display_name,
  group_kind = excluded.group_kind,
  workspace_value = excluded.workspace_value,
  entra_group_id = excluded.entra_group_id,
  github_team_slug = excluded.github_team_slug,
  updated_at = now();

alter table public.workspace_access_groups enable row level security;
revoke all on table public.workspace_access_groups from anon, authenticated;

comment on table public.workspace_access_groups is
  'Canonical Workspace access matrix mapped to Microsoft Entra groups and GitHub organization teams.';
