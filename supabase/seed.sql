-- ============================================================================
-- boulder-coach — seed: назначение ПЕРВОГО администратора (SPEC 2.1).
-- Создание auth-пользователя возможно только через Supabase Auth (Dashboard /
-- sign-up / Admin API) — чистым SQL в auth.users писать нельзя. Поэтому:
--   1) зарегистрируйте будущего админа обычным способом (e-mail/пароль),
--   2) подставьте его e-mail ниже и выполните этот файл (повышение до admin).
-- ============================================================================

update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and u.email = 'REPLACE_WITH_ADMIN_EMAIL';   -- ← укажите e-mail первого админа

-- Проверка:
-- select id, email, role from public.profiles where role = 'admin';
