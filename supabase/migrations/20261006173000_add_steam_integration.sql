create table if not exists public.workspace_steam_connections (
  member_id text primary key,
  steam_id text not null unique,
  profile_url text not null default '',
  package_status text not null default 'pending_admin' check (package_status in ('pending_admin', 'ready')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_steam_openid_states (
  state_hash text primary key,
  member_id text not null,
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_steam_openid_states_expires_idx
  on public.workspace_steam_openid_states(expires_at);

alter table public.workspace_steam_connections enable row level security;
alter table public.workspace_steam_openid_states enable row level security;

revoke all on table public.workspace_steam_connections from anon, authenticated;
revoke all on table public.workspace_steam_openid_states from anon, authenticated;

comment on table public.workspace_steam_connections is
  'Server-only Steam identity links and Steamworks autogrant assignment status.';
