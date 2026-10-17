create table if not exists public.workspace_policy_acceptances (
  member_id text not null,
  document_version text not null,
  documents jsonb not null,
  accepted_at timestamptz not null,
  ip_hash text not null,
  user_agent_hash text not null,
  receipt_hash text not null,
  primary key (member_id, document_version)
);

create index if not exists workspace_policy_acceptances_accepted_at_idx
  on public.workspace_policy_acceptances (accepted_at desc);

alter table public.workspace_policy_acceptances enable row level security;
revoke all on public.workspace_policy_acceptances from public, anon, authenticated;
grant select, insert on public.workspace_policy_acceptances to service_role;
