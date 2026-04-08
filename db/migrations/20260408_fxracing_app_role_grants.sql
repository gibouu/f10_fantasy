-- Provision grants and RLS policies for the dedicated runtime role.
--
-- Password creation/rotation is intentionally handled outside the repo.
-- Expected role name: fxracing_app

begin;

grant connect on database postgres to fxracing_app;
grant usage on schema public to fxracing_app;
grant select, insert, update, delete on all tables in schema public to fxracing_app;
grant usage, select on all sequences in schema public to fxracing_app;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to fxracing_app;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to fxracing_app;

do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
        and policyname = 'fxracing_app_full_access'
    ) then
      execute format(
        'create policy fxracing_app_full_access on public.%I for all to fxracing_app using (true) with check (true)',
        table_name
      );
    end if;
  end loop;
end
$$;

commit;
