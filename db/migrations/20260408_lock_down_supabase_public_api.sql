-- Lock down Supabase's public API surface for this app.
--
-- The application uses direct Postgres connections via Prisma, not supabase-js.
-- That means anon/authenticated should not have direct access to the public
-- schema tables at all.

begin;

-- Existing schema exposure
revoke usage on schema public from anon, authenticated;

-- Existing objects
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
revoke all privileges on all functions in schema public from anon, authenticated;

-- Future objects created by the postgres role used by Prisma migrations/db push
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

-- Ensure every current public table is RLS-protected at the API layer.
do $$
declare
  table_name text;
begin
  for table_name in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end
$$;

commit;
