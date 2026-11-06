begin;
-- Bind only the explicitly authorized and confirmed email to its real Auth UUID.
-- This also revokes research access if that account changes to another email.
create or replace function public.study2_sync_owner_researcher()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if lower(new.email) = 'huangrui1008@gmail.com' and new.email_confirmed_at is not null then
    insert into public.study2_researchers(user_id) values (new.id) on conflict (user_id) do nothing;
  else
    delete from public.study2_researchers where user_id = new.id;
  end if;
  return new;
end $$;
revoke all on function public.study2_sync_owner_researcher() from public, anon, authenticated;
drop trigger if exists study2_sync_owner_researcher on auth.users;
create trigger study2_sync_owner_researcher after insert or update of email, email_confirmed_at on auth.users
for each row execute function public.study2_sync_owner_researcher();
insert into public.study2_researchers(user_id)
select id from auth.users where lower(email)='huangrui1008@gmail.com' and email_confirmed_at is not null
on conflict (user_id) do nothing;
commit;
