-- Workspace uses opaque sessions validated by workspace-api, not Supabase Auth.
-- Only the service role inside that API may access these private diary rows.
create table public.workspace_timesheets (
  member_id text primary key,
  document jsonb not null default '{"entries":[],"timer":null}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint timesheet_document_shape check (
    jsonb_typeof(document) = 'object'
    and jsonb_typeof(document->'entries') = 'array'
    and document ? 'timer'
  )
);
alter table public.workspace_timesheets enable row level security;
revoke all on public.workspace_timesheets from public, anon, authenticated;
grant select, insert, update on public.workspace_timesheets to service_role;
