-- Explicit private test dispatch may run while normal automations remain off.
-- Overload requires the argument, keeping the scheduled zero-argument claim intact.
create function public.workspace_email_claim(p_test_only boolean)
returns setof public.workspace_email_queue
language plpgsql security invoker set search_path = '' as $$
begin
  if p_test_only is distinct from true then raise exception 'Use the standard claim function for normal delivery.'; end if;
  update public.workspace_email_queue set status='uncertain',last_error='Test worker interrupted; check the mailbox before retrying.'
    where status='sending' and claimed_at<now()-interval '5 minutes' and content->>'title' like '[TEST%';
  return query update public.workspace_email_queue set status='sending',claimed_at=now(),attempts=attempts+1
    where id in (select id from public.workspace_email_queue where status='pending' and available_at<=now() and attempts<5 and content->>'title' like '[TEST%' order by created_at for update skip locked limit 3)
    returning *;
end $$;
revoke all on function public.workspace_email_claim(boolean) from public, anon, authenticated;
grant execute on function public.workspace_email_claim(boolean) to service_role;
