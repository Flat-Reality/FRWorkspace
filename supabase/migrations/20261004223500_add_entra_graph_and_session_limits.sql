alter table public.workspace_sessions
  add column if not exists auth_method text not null default 'legacy',
  add column if not exists idle_expires_at timestamptz,
  add column if not exists last_activity_at timestamptz not null default now();

create index if not exists workspace_sessions_idle_expires_at_idx
  on public.workspace_sessions(idle_expires_at)
  where idle_expires_at is not null;

create or replace function public.get_entra_runtime_secrets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in ('entra_tenant_id', 'entra_client_id', 'entra_client_secret');
$$;

revoke all on function public.get_entra_runtime_secrets() from public, anon, authenticated;
grant execute on function public.get_entra_runtime_secrets() to service_role;

comment on function public.get_entra_runtime_secrets() is
  'Returns Microsoft Graph application credentials to service-role callers only.';
