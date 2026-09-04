-- Flat Reality Workspace security hardening.
-- Run this only after confirming the current site build is deployed.
-- This script is non-destructive: it creates a backup table before changing access.

create extension if not exists pgcrypto;

create table if not exists public.workspace_state_backup as
select *
from public.workspace_state;

alter table public.workspace_state enable row level security;

revoke all on table public.workspace_state from anon;
revoke all on table public.workspace_state from authenticated;

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
