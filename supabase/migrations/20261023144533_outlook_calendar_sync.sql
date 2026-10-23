create table public.workspace_outlook_events (
  shift_id text primary key,
  member_id text not null,
  user_id text not null,
  event_id text,
  transaction_id uuid not null default gen_random_uuid(),
  payload_hash text not null default '',
  last_error text,
  synced_at timestamptz
);
alter table public.workspace_outlook_events enable row level security;
revoke all on public.workspace_outlook_events from public, anon, authenticated;
grant all on public.workspace_outlook_events to service_role;

create table public.workspace_outlook_lock (
  id boolean primary key default true check (id),
  owner uuid,
  expires_at timestamptz not null default '-infinity'
);
insert into public.workspace_outlook_lock (id) values (true);
alter table public.workspace_outlook_lock enable row level security;
revoke all on public.workspace_outlook_lock from public, anon, authenticated;
grant all on public.workspace_outlook_lock to service_role;

create function public.acquire_workspace_outlook_lock(lock_owner uuid)
returns boolean language sql security invoker set search_path = '' as $$
  with acquired as (
    update public.workspace_outlook_lock
    set owner = lock_owner, expires_at = now() + interval '4 minutes'
    where id = true and expires_at < now()
    returning id
  ) select exists(select 1 from acquired);
$$;
create function public.release_workspace_outlook_lock(lock_owner uuid)
returns void language sql security invoker set search_path = '' as $$
  update public.workspace_outlook_lock set owner = null, expires_at = '-infinity'
  where id = true and owner = lock_owner;
$$;
revoke all on function public.acquire_workspace_outlook_lock(uuid) from public, anon, authenticated;
revoke all on function public.release_workspace_outlook_lock(uuid) from public, anon, authenticated;
grant execute on function public.acquire_workspace_outlook_lock(uuid) to service_role;
grant execute on function public.release_workspace_outlook_lock(uuid) to service_role;
