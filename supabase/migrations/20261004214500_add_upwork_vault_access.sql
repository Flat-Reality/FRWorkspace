create or replace function public.get_upwork_runtime_secrets()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(name, decrypted_secret), '{}'::jsonb)
  from vault.decrypted_secrets
  where name in (
    'upwork_client_id',
    'upwork_client_secret',
    'upwork_token_encryption_key'
  );
$$;

revoke all on function public.get_upwork_runtime_secrets() from public, anon, authenticated;
grant execute on function public.get_upwork_runtime_secrets() to service_role;

comment on function public.get_upwork_runtime_secrets() is
  'Returns Upwork integration credentials to service-role callers only.';
