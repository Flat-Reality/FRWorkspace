create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job where jobname = 'retainer-plus-sync-every-5-minutes';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
end $$;

select cron.schedule(
  'retainer-plus-sync-every-5-minutes',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://kcsxspifrkuhbdmfahoy.supabase.co/functions/v1/workspace-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-workspace-sync-token', (select decrypted_secret from vault.decrypted_secrets where name = 'workspace_sync_cron_token' limit 1)
      ),
      body := '{"source":"supabase-cron","retainerOnly":true}'::jsonb,
      timeout_milliseconds := 10000
    );
  $cron$
);
