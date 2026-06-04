-- ============================================================================
-- boulder-coach — Migration 0006: безопасный серверный путь смены роли (для
-- инвайтов тренеров через Edge Function) + закрытие эскалации через e-mail.
-- Применять ПОСЛЕ 0001–0004. Исправляет находки security-ревью инвайт-флоу.
-- ============================================================================

-- 1) e-mail неизменяем для обычных пользователей и уникален → profiles.email
--    снова можно доверять (закрывает подмену e-mail ради повышения до coach).
create unique index if not exists profiles_email_uidx on public.profiles (email);

-- 2) Гард профиля: смену role/qr/email пропускаем только если вызывающий админ
--    ИЛИ установлен доверенный transaction-local флаг (серверный путь через RPC).
create or replace function public.guard_profiles_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if coalesce(current_setting('app.role_change_ok', true), '') = '1' then
    return new;                                   -- доверенный серверный путь (app_set_role_service)
  end if;
  if new.role is distinct from old.role then
    raise exception 'ROLE_CHANGE_FORBIDDEN';
  end if;
  if new.athlete_qr_token is distinct from old.athlete_qr_token then
    raise exception 'QR_TOKEN_IMMUTABLE';
  end if;
  if new.email is distinct from old.email then
    raise exception 'EMAIL_IMMUTABLE';            -- закрывает эскалацию через подмену e-mail
  end if;
  return new;
end $$;

-- 3) Серверная смена роли — ТОЛЬКО для service_role (Edge Function invite-coach,
--    которая сама проверяет, что вызывающий — админ). auth.uid()/JWT тут нет,
--    поэтому обычный app_set_role (через is_admin()) не подходит — нужен этот путь.
create or replace function public.app_set_role_service(p_user uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.role_change_ok', '1', true);   -- разрешить гарду смену роли
  update public.profiles set role = p_role where id = p_user;
end $$;

revoke all on function public.app_set_role_service(uuid, public.user_role) from public;
revoke all on function public.app_set_role_service(uuid, public.user_role) from anon;
revoke all on function public.app_set_role_service(uuid, public.user_role) from authenticated;
grant execute on function public.app_set_role_service(uuid, public.user_role) to service_role;
