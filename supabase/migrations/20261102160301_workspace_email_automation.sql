-- Optional mail subsystem. Installation alone never sends mail or awards XP.
-- Apply only to FRWorkspace kcsxspifrkuhbdmfahoy after reviewing docs/EMAIL.md.
create table public.workspace_email_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  monthly_enabled boolean not null default false,
  onboarding_enabled boolean not null default false,
  activated_at timestamptz,
  updated_at timestamptz not null default now()
);
insert into public.workspace_email_settings(id) values(true);

create table public.workspace_email_queue (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  member_id text not null,
  recipient text not null,
  content jsonb not null,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','uncertain','cancelled')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index workspace_email_pending on public.workspace_email_queue(available_at) where status='pending';
create table public.workspace_monthly_xp (
  member_id text not null,
  period text not null,
  xp integer not null check (xp >= 0),
  created_at timestamptz not null default now(),
  primary key(member_id, period)
);
alter table public.workspace_email_settings enable row level security;
alter table public.workspace_email_queue enable row level security;
alter table public.workspace_monthly_xp enable row level security;
revoke all on public.workspace_email_settings, public.workspace_email_queue, public.workspace_monthly_xp from public, anon, authenticated;
grant select, insert, update, delete on public.workspace_email_queue to service_role;
grant select, update on public.workspace_email_settings to service_role;
grant select, insert on public.workspace_monthly_xp to service_role;

-- Server-managed cumulative XP survives an autosave from an already-open browser.
create function public.workspace_preserve_monthly_xp() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; previous jsonb; result jsonb := '[]'; difference integer;
begin
  if new.id <> 'workspace' then return new; end if;
  for item in select value from jsonb_array_elements(new.state->'members') loop
    select value into previous from jsonb_array_elements(old.state->'members') where value->>'id'=item->>'id';
    difference := greatest(0, coalesce((previous->>'monthlyXpTotal')::integer,0)-coalesce((item->>'monthlyXpTotal')::integer,0));
    if difference > 0 then
      item := item || jsonb_build_object('xp',coalesce((item->>'xp')::integer,0)+difference,'monthlyXpTotal',(previous->>'monthlyXpTotal')::integer);
    end if;
    result := result || jsonb_build_array(item);
  end loop;
  new.state := jsonb_set(new.state,'{members}',result);
  return new;
end $$;
create trigger workspace_preserve_monthly_xp before update on public.workspace_state for each row execute function public.workspace_preserve_monthly_xp();

-- An event and its email are committed together. Existing records are never backfilled.
create function public.workspace_queue_hr_email() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare item jsonb; previous jsonb; member jsonb; recipient text; kind text; key text;
begin
  if new.id <> 'workspace' or not exists(select 1 from public.workspace_email_settings where enabled) then return new; end if;
  for item in select value from jsonb_array_elements(new.state->'workRecords') loop
    if item->>'type' not in ('strike','explanation_request') or exists(select 1 from jsonb_array_elements(old.state->'workRecords') where value->>'id'=item->>'id') then continue; end if;
    select value into member from jsonb_array_elements(new.state->'members') where value->>'id'=item->>'memberId';
    recipient := coalesce(nullif(member->>'entraEmail',''),nullif(member->>'workEmail',''),nullif(member->>'personalEmail',''));
    if recipient is null then continue; end if;
    insert into public.workspace_email_queue(dedupe_key,member_id,recipient,content)
    values('record:'||(item->>'id'),member->>'id',recipient,jsonb_build_object('kind',item->>'type','name',coalesce(nullif(member->>'preferredName',''),member->>'fullName')))
    on conflict(dedupe_key) do nothing;
  end loop;
  for member in select value from jsonb_array_elements(new.state->'members') loop
    select value into previous from jsonb_array_elements(old.state->'members') where value->>'id'=member->>'id';
    if previous is null or (member->>'status',coalesce(member->>'statusUntil','')) is not distinct from (previous->>'status',coalesce(previous->>'statusUntil','')) then continue; end if;
    kind := case member->>'status' when 'paused' then 'pause_approved' when 'mental_health_days' then 'mental_health_approved' else null end;
    if kind is null then continue; end if; -- Sick leave intentionally has no email trigger.
    recipient := coalesce(nullif(member->>'entraEmail',''),nullif(member->>'workEmail',''),nullif(member->>'personalEmail',''));
    if recipient is null then continue; end if;
    key := 'status:'||(member->>'id')||':'||gen_random_uuid()::text;
    insert into public.workspace_email_queue(dedupe_key,member_id,recipient,content)
    values(key,member->>'id',recipient,jsonb_build_object('kind',kind,'name',coalesce(nullif(member->>'preferredName',''),member->>'fullName'),'until',member->>'statusUntil'));
  end loop;
  return new;
end $$;
create trigger workspace_queue_hr_email after update on public.workspace_state for each row execute function public.workspace_queue_hr_email();

create function public.workspace_email_schedule() returns void
language plpgsql security invoker set search_path = '' as $$
declare settings public.workspace_email_settings; current_state jsonb; members jsonb := '[]'; member jsonb;
  period_start date := (date_trunc('month',now() at time zone 'Europe/Madrid')-interval '1 month')::date;
  period_end date := date_trunc('month',now() at time zone 'Europe/Madrid')::date;
  period text; recipient text; hours numeric; started date; xp integer; affected integer; first_month date;
begin
  select * into settings from public.workspace_email_settings where id;
  if not settings.enabled or settings.activated_at is null then return; end if;
  select state into current_state from public.workspace_state where id='workspace' for update;
  period := to_char(period_start,'YYYY-MM');
  for member in select value from jsonb_array_elements(current_state->'members') loop
    recipient := coalesce(nullif(member->>'entraEmail',''),nullif(member->>'workEmail',''),nullif(member->>'personalEmail',''));
    if member->>'status'='suspended' then members := members || jsonb_build_array(member); continue; end if;
    if settings.onboarding_enabled and recipient is not null and not coalesce((member#>>'{onboarding,completed}')::boolean,false) then
      insert into public.workspace_email_queue(dedupe_key,member_id,recipient,content)
      values('onboarding:'||(member->>'id')||':'||to_char(now() at time zone 'Europe/Madrid','IYYY-IW'),member->>'id',recipient,
        jsonb_build_object('kind','onboarding_reminder','name',coalesce(nullif(member->>'preferredName',''),member->>'fullName')))
      on conflict(dedupe_key) do nothing;
    end if;
    -- Only complete calendar months after activation. No retroactive XP or email flood.
    first_month := (date_trunc('month',settings.activated_at at time zone 'Europe/Madrid')+interval '1 month')::date;
    if settings.monthly_enabled and period_end >= first_month and member->>'workStartDate' ~ '^\d{4}-\d{2}-\d{2}$' then
      begin started := (member->>'workStartDate')::date; exception when others then started := null; end;
      if started is not null and started < period_end then
        xp := case when (started + interval '1 month')::date <= period_end then 50 else 0 end;
        insert into public.workspace_monthly_xp(member_id,period,xp) values(member->>'id',period,xp) on conflict do nothing;
        get diagnostics affected = row_count;
        if affected > 0 then
          member := member || jsonb_build_object('xp',coalesce((member->>'xp')::integer,0)+xp,'monthlyXpTotal',coalesce((member->>'monthlyXpTotal')::integer,0)+xp);
          select coalesce(round(sum(greatest(0,extract(epoch from (least((entry->>'end')::timestamptz,period_end::timestamp at time zone 'Europe/Madrid')-greatest((entry->>'start')::timestamptz,period_start::timestamp at time zone 'Europe/Madrid')))))/3600,2),0)
          into hours from public.workspace_timesheets t, jsonb_array_elements(t.document->'entries') entry where t.member_id=member->>'id';
          if recipient is not null then
            insert into public.workspace_email_queue(dedupe_key,member_id,recipient,content)
            values('monthly:'||(member->>'id')||':'||period,member->>'id',recipient,jsonb_build_object('kind','monthly_summary','name',coalesce(nullif(member->>'preferredName',''),member->>'fullName'),'period',period,'xp',xp,'totalXp',(member->>'xp')::integer,'hours',hours)) on conflict(dedupe_key) do nothing;
          end if;
        end if;
      end if;
    end if;
    members := members || jsonb_build_array(member);
  end loop;
  if members is distinct from current_state->'members' then update public.workspace_state set state=jsonb_set(current_state,'{members}',members),updated_at=now() where id='workspace'; end if;
  -- Completed onboarding or a removed/suspended account cancels queued reminders.
  update public.workspace_email_queue q set status='cancelled' where q.status='pending' and (
    not exists(select 1 from jsonb_array_elements(current_state->'members') m where m->>'id'=q.member_id and m->>'status'<>'suspended')
    or (q.content->>'kind'='onboarding_reminder' and exists(select 1 from jsonb_array_elements(current_state->'members') m where m->>'id'=q.member_id and coalesce((m#>>'{onboarding,completed}')::boolean,false)))
  );
  -- Retain delivery metadata for 90 days; never delete the XP ledger.
  delete from public.workspace_email_queue where created_at < now()-interval '90 days' and status in ('sent','cancelled');
end $$;

create function public.workspace_email_claim() returns setof public.workspace_email_queue
language plpgsql security invoker set search_path = '' as $$
begin
  -- An interrupted SMTP handoff may already have delivered. Never blindly resend it.
  update public.workspace_email_queue set status='uncertain',last_error='Worker interrupted; check the mailbox before retrying.' where status='sending' and claimed_at<now()-interval '5 minutes';
  return query update public.workspace_email_queue set status='sending',claimed_at=now(),attempts=attempts+1
    where id in (select id from public.workspace_email_queue where status='pending' and available_at<=now() and attempts<5 order by created_at for update skip locked limit 3)
    returning *;
end $$;
revoke all on function public.workspace_preserve_monthly_xp(), public.workspace_queue_hr_email(), public.workspace_email_schedule(), public.workspace_email_claim() from public, anon, authenticated;
grant execute on function public.workspace_preserve_monthly_xp(), public.workspace_queue_hr_email(), public.workspace_email_schedule(), public.workspace_email_claim() to service_role;

-- Reuse the existing private cron token; worker checks it itself (verify_jwt=false).
select cron.schedule('workspace-email-every-5-minutes','*/5 * * * *', $job$
  select net.http_post(url := 'https://kcsxspifrkuhbdmfahoy.supabase.co/functions/v1/workspace-email',
    headers := jsonb_build_object('Content-Type','application/json','x-workspace-sync-token',(select decrypted_secret from vault.decrypted_secrets where name='workspace_sync_cron_token' limit 1)),
    body := '{}'::jsonb,timeout_milliseconds := 120000);
$job$);
