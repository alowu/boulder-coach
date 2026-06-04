-- ТОЛЬКО ДЛЯ ЛОКАЛЬНЫХ ТЕСТОВ (Docker). Эмулирует то, что в реальном Supabase
-- предоставляет платформа: роли, схему auth, auth.users, auth.uid().
-- auth.uid() читает sub из request.jwt.claims (как в Supabase) с фолбэком на app.uid.
create extension if not exists pgcrypto;

do $$ begin create role anon                nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated       nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role        nologin; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_auth_admin nologin; exception when duplicate_object then null; end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid,
    nullif(current_setting('app.uid', true), '')::uuid
  );
$$;

-- Хелпер теста: «войти» как пользователь (для RLS нужен не-суперюзер + JWT-claims).
-- Использование в psql: select test_login('<uuid>','coach'); set role authenticated;
create or replace function public.test_login(p_uid uuid, p_role text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'user_role', p_role)::text, false);
end $$;
