begin;
-- Additive sidecar: never rewrites or deletes historical experiment_data rows.
create table if not exists public.study2_sessions (
  pid uuid primary key,
  token_hash text not null,
  group_name text not null check (group_name in ('A','B')),
  entry_mode text not null check (entry_mode in ('random','fixed')),
  status text not null default 'in_progress' check (status in ('in_progress','completed')),
  current_step integer not null default 0 check (current_step between 0 and 8),
  revision integer not null default 0,
  record jsonb not null default '{}',
  chat_history jsonb not null default '[]',
  ai_requests integer not null default 0,
  ai_busy_since timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists public.study2_researchers (
  user_id uuid primary key references auth.users(id),
  added_at timestamptz not null default now()
);
create table if not exists public.study2_quotas (
  quota_key text primary key, used integer not null default 0
);
alter table public.study2_sessions enable row level security;
alter table public.study2_researchers enable row level security;
alter table public.study2_quotas enable row level security;
-- All data access goes through the Edge Function. No anonymous data read/write.
revoke all on public.study2_sessions, public.study2_researchers, public.study2_quotas from public, anon, authenticated;
grant all on public.study2_sessions, public.study2_researchers, public.study2_quotas to service_role;
-- Preserve the original table, including all existing data and its column types.
-- Old tabs must reload after this switch; the old direct browser POST is closed.
do $$
declare c record;
begin
  if to_regclass('public.experiment_data') is not null then
    alter table public.experiment_data enable row level security;
    revoke all on public.experiment_data from public, anon, authenticated;
    for c in select column_name from information_schema.columns
      where table_schema='public' and table_name='experiment_data' loop
      execute format('revoke all (%I) on public.experiment_data from public, anon, authenticated', c.column_name);
    end loop;
    grant select on public.experiment_data to service_role;
  end if;
end $$;
create or replace function public.study2_reserve_quota(p_key text, p_limit integer)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  if p_limit < 1 then return false; end if;
  insert into public.study2_quotas(quota_key, used) values (p_key,1)
  on conflict (quota_key) do update set used=study2_quotas.used+1
  where study2_quotas.used < p_limit returning used into n;
  return n is not null;
end $$;
create or replace function public.study2_backend_ready()
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare t text; r text;
begin
  foreach t in array array['study2_sessions','study2_researchers','study2_quotas','experiment_data'] loop
    if to_regclass('public.'||t) is null then
      if t='experiment_data' then continue; end if;
      return false;
    end if;
    if not (select relrowsecurity from pg_class where oid=to_regclass('public.'||t)) then return false; end if;
    foreach r in array array['anon','authenticated'] loop
      if has_table_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
        or has_any_column_privilege(r,'public.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then return false; end if;
    end loop;
  end loop;
  return true;
end $$;
create or replace function public.study2_field_schema()
returns table(table_name text, column_name text, data_type text)
language sql security definer set search_path = public, pg_temp as $$
  select c.table_name::text,c.column_name::text,c.data_type::text
  from information_schema.columns c where c.table_schema='public'
  and c.table_name in ('study2_sessions','experiment_data') order by c.table_name,c.ordinal_position;
$$;
revoke all on function public.study2_reserve_quota(text,integer), public.study2_backend_ready(), public.study2_field_schema() from public,anon,authenticated;
grant execute on function public.study2_reserve_quota(text,integer), public.study2_backend_ready(), public.study2_field_schema() to service_role;
commit;
