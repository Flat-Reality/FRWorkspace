create table if not exists public.workspace_github_connections (
  member_id text primary key,
  github_user_id bigint not null,
  github_username text not null,
  profile_url text not null default '',
  avatar_url text not null default '',
  email text not null default '',
  membership_state text not null default 'pending' check (membership_state in ('pending', 'active', 'error')),
  team_slugs text[] not null default '{}',
  sync_error text not null default '',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_github_oauth_states (
  state_hash text primary key,
  member_id text not null,
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_github_installations (
  organization_login text primary key,
  installation_id bigint not null unique,
  account_id bigint,
  repository_selection text not null default '',
  suspended_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_github_project_teams (
  project_key text primary key,
  team_slug text not null,
  updated_at timestamptz not null default now()
);

insert into public.workspace_github_project_teams (project_key, team_slug)
values
  ('FR Partners', 'partners'),
  ('The Nick', 'the-nick'),
  ('RAIN HEART', 'rain-heart')
on conflict (project_key) do nothing;

create index if not exists workspace_github_oauth_states_expires_idx
  on public.workspace_github_oauth_states(expires_at);

alter table public.workspace_github_connections enable row level security;
alter table public.workspace_github_oauth_states enable row level security;
alter table public.workspace_github_installations enable row level security;
alter table public.workspace_github_project_teams enable row level security;

revoke all on table public.workspace_github_connections from anon, authenticated;
revoke all on table public.workspace_github_oauth_states from anon, authenticated;
revoke all on table public.workspace_github_installations from anon, authenticated;
revoke all on table public.workspace_github_project_teams from anon, authenticated;

create or replace function public.get_github_runtime_secrets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in (
    'github_app_id',
    'github_client_id',
    'github_client_secret',
    'github_private_key',
    'github_organization'
  );
$$;

revoke all on function public.get_github_runtime_secrets() from public, anon, authenticated;
grant execute on function public.get_github_runtime_secrets() to service_role;

comment on table public.workspace_github_connections is
  'Server-only GitHub identity links and organization access synchronization status.';
comment on function public.get_github_runtime_secrets() is
  'Returns GitHub App credentials to service-role callers only.';
