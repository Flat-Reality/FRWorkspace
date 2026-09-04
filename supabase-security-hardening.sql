-- Flat Reality Workspace security hardening.
-- Run this only after confirming the current site build is deployed.
-- This script is non-destructive: it creates a backup table before changing access.

create extension if not exists pgcrypto;

create table if not exists public.workspace_state_backup as
select *
from public.workspace_state;

create table if not exists public.workspace_credentials (
  member_id text primary key,
  employment_id text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.workspace_credentials (member_id, employment_id, password_hash)
select
  member->>'id',
  member->>'employmentId',
  member->>'passwordHash'
from public.workspace_state,
  jsonb_array_elements(state->'members') as member
where id = 'workspace'
  and coalesce(member->>'id', '') <> ''
  and coalesce(member->>'employmentId', '') <> ''
  and coalesce(member->>'passwordHash', '') <> ''
on conflict (member_id) do update set
  employment_id = excluded.employment_id,
  password_hash = excluded.password_hash,
  updated_at = now();

update public.workspace_state
set state = jsonb_set(
  state,
  '{members}',
  (
    select jsonb_agg(member - 'passwordHash' || jsonb_build_object('passwordHash', ''))
    from jsonb_array_elements(state->'members') as member
  )
)
where id = 'workspace'
  and state ? 'members';

create table if not exists public.workspace_sessions (
  token_hash text primary key,
  member_id text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_sessions_member_id_idx on public.workspace_sessions(member_id);
create index if not exists workspace_sessions_expires_at_idx on public.workspace_sessions(expires_at);

alter table public.workspace_state enable row level security;
alter table public.workspace_credentials enable row level security;
alter table public.workspace_sessions enable row level security;

revoke all on table public.workspace_state from anon;
revoke all on table public.workspace_state from authenticated;
revoke all on table public.workspace_credentials from anon;
revoke all on table public.workspace_credentials from authenticated;
revoke all on table public.workspace_sessions from anon;
revoke all on table public.workspace_sessions from authenticated;

create table if not exists public.workspace_audit_log (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_member_id text,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.workspace_audit_log enable row level security;

revoke all on table public.workspace_audit_log from anon;
revoke all on table public.workspace_audit_log from authenticated;

create table if not exists public.workspace_security_notes (
  id text primary key,
  note text not null,
  created_at timestamptz not null default now()
);

insert into public.workspace_security_notes (id, note)
values (
  'github-pages-limitation',
  'GitHub Pages is static hosting. Full database security requires server-side authorization through Supabase Auth, Edge Functions, or locked SECURITY DEFINER RPC functions. Do not grant direct anon access to workspace_state in production.'
)
on conflict (id) do update set note = excluded.note;
