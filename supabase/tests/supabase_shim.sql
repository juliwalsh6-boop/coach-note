-- =====================================================================
-- ローカル検証用: 素の PostgreSQL を Supabase に近い状態にするシム
-- （本番の Supabase では実行しないでください。Supabase には最初から存在します）
--
--   psql -f supabase/tests/supabase_shim.sql
--   psql -f supabase/migrations/20261025000000_init.sql
--   psql -f supabase/tests/rls_test.sql
-- =====================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb,
  created_at timestamptz not null default now()
);

-- Supabase と同じ定義
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- 2026年以降の新規 Supabase プロジェクトと同様、public のテーブルには自動で権限を付けない
grant usage on schema public to anon, authenticated, service_role;
