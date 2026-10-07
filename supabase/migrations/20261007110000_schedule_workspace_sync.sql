create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'workspace_sync_cron_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'workspace_sync_cron_token');
  end if;
end;
$$;

create or replace function public.get_workspace_sync_cron_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'workspace_sync_cron_token'
  limit 1;
$$;

revoke all on function public.get_workspace_sync_cron_token() from public, anon, authenticated;
grant execute on function public.get_workspace_sync_cron_token() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'workspace-sync-every-5-minutes';
  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end;
$$;

select cron.schedule(
  'workspace-sync-every-5-minutes',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://kcsxspifrkuhbdmfahoy.supabase.co/functions/v1/workspace-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-workspace-sync-token', (
          select decrypted_secret from vault.decrypted_secrets where name = 'workspace_sync_cron_token' limit 1
        )
      ),
      body := '{"source":"supabase-cron"}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
