create table if not exists public.workspace_upwork_connections (
  member_id text primary key,
  upwork_user_id text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  token_expires_at timestamptz not null,
  granted_scopes text[] not null default '{}',
  status text not null default 'connected' check (status in ('connected', 'disabled', 'error')),
  profile_url text not null default '',
  profile_title text not null default '',
  profile_rate numeric,
  profile_currency text not null default 'USD',
  photo_url text not null default '',
  last_synced_at timestamptz,
  sync_error text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_upwork_oauth_states (
  state_hash text primary key,
  member_id text not null,
  code_verifier text not null,
  return_url text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_upwork_contracts (
  member_id text not null,
  upwork_contract_id text not null,
  title text not null default '',
  contract_type text not null check (contract_type in ('hourly', 'fixed-price')),
  rate numeric,
  currency text not null default 'USD',
  weekly_limit numeric,
  status text not null check (status in ('Active', 'Paused', 'Closed')),
  start_date date,
  end_date date,
  current_milestone_id text,
  current_milestone_description text not null default '',
  current_milestone_amount numeric,
  payload jsonb not null default '{}'::jsonb,
  cached_at timestamptz not null default now(),
  primary key (member_id, upwork_contract_id)
);

create table if not exists public.workspace_upwork_payment_summaries (
  member_id text primary key,
  earnings numeric not null default 0,
  fees numeric not null default 0,
  fixed_price_milestones numeric not null default 0,
  paid numeric not null default 0,
  pending numeric not null default 0,
  currency text not null default 'USD',
  cached_at timestamptz not null default now()
);

create table if not exists public.workspace_upwork_time_entries (
  member_id text not null,
  entry_id text not null,
  worked_on date not null,
  hours numeric not null default 0,
  charges numeric not null default 0,
  currency text not null default 'USD',
  contract_id text not null default '',
  contract_title text not null default '',
  memo text not null default '',
  cached_at timestamptz not null default now(),
  primary key (member_id, entry_id)
);

create table if not exists public.workspace_upwork_contract_drafts (
  id uuid primary key default gen_random_uuid(),
  member_id text not null,
  created_by_member_id text not null,
  title text not null,
  contract_type text not null check (contract_type in ('hourly', 'fixed-price')),
  rate numeric not null default 0,
  weekly_limit numeric not null default 0,
  milestone_description text not null default '',
  milestone_amount numeric not null default 0,
  start_date date,
  end_date date,
  status text not null default 'ready_for_upwork' check (status in ('ready_for_upwork', 'submitted', 'failed')),
  upwork_offer_id text,
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_upwork_contracts_member_status_idx
  on public.workspace_upwork_contracts(member_id, status);
create index if not exists workspace_upwork_time_entries_member_date_idx
  on public.workspace_upwork_time_entries(member_id, worked_on desc);
create index if not exists workspace_upwork_oauth_states_expires_idx
  on public.workspace_upwork_oauth_states(expires_at);

alter table public.workspace_upwork_connections enable row level security;
alter table public.workspace_upwork_oauth_states enable row level security;
alter table public.workspace_upwork_contracts enable row level security;
alter table public.workspace_upwork_payment_summaries enable row level security;
alter table public.workspace_upwork_time_entries enable row level security;
alter table public.workspace_upwork_contract_drafts enable row level security;

revoke all on table public.workspace_upwork_connections from anon, authenticated;
revoke all on table public.workspace_upwork_oauth_states from anon, authenticated;
revoke all on table public.workspace_upwork_contracts from anon, authenticated;
revoke all on table public.workspace_upwork_payment_summaries from anon, authenticated;
revoke all on table public.workspace_upwork_time_entries from anon, authenticated;
revoke all on table public.workspace_upwork_contract_drafts from anon, authenticated;

comment on table public.workspace_upwork_connections is 'Encrypted OAuth credentials and short-lived Upwork profile cache. Service-role only.';
comment on table public.workspace_upwork_contracts is 'Upwork contract cache. Rows are refreshed or removed within the 24-hour API cache window.';
comment on table public.workspace_upwork_payment_summaries is 'Upwork payment summary cache. Service-role only.';
comment on table public.workspace_upwork_time_entries is 'Upwork time tracker cache. Service-role only.';
