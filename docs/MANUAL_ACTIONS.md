# Ручные действия (то, что нужно сделать вам)

Claude не может выполнить эти шаги сам — нужны ваши логины/доступы во внешних сервисах. Список отсортирован по порядку.

> Легенда: ⛳️ — обязательно для MVP; 🅿️ — только для Фазы 2; 💤 — опционально.

## 1. ⛳️ Создать проект Supabase
1. Зарегистрируйтесь на https://supabase.com → **New project** (регион выберите ближайший, напр. EU).
2. Сохраните: **Project URL**, **anon public key**, **service_role key** (последний — секрет, в код/гит не коммитить).
3. В `frontend/.env` (см. `.env.example`) пропишите `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY`.

## 2. ⛳️ Применить миграции БД
Вариант А (Supabase CLI, рекомендуется):
```bash
npm i -g supabase
supabase link --project-ref <ref>     # ref из URL проекта
supabase db push                      # применит supabase/migrations/0001..0004
```
Вариант Б (вручную): откройте **SQL Editor** в Dashboard и выполните по очереди
`0001_init_schema.sql` → `0002_functions_and_triggers.sql` → `0003_rls.sql` → `0004_views_stats.sql`.
(Файл `0005_phase2_routes.sql` — только когда возьмётесь за Фазу 2.)

## 3. ⛳️ Включить Custom Access Token Hook (роль в JWT)
Dashboard → **Authentication → Hooks → Customize Access Token (JWT) Claims** →
выберите функцию `public.custom_access_token_hook`. Без этого роль будет
определяться запасным путём (через `profiles`), что медленнее, но рабоче.

## 4. ⛳️ Настроить провайдеры входа
- **Email/Password:** Authentication → Providers → Email → включить;
  **выключить** «Confirm email» (SPEC 4.1.2 — подтверждение не требуется).
- **Google OAuth:** Authentication → Providers → Google → включить, вставить
  Client ID / Client Secret из Google Cloud Console (OAuth consent + credentials).
  В Google добавьте redirect URL вида `https://<ref>.supabase.co/auth/v1/callback`.
- Настройте **Site URL** и **Redirect URLs** на адрес фронта (см. шаг 7).

## 5. ⛳️ Создать первого администратора
1. Зарегистрируйтесь в приложении как обычный пользователь (будущий админ).
2. В SQL Editor выполните `supabase/seed.sql`, подставив свой e-mail в
   `REPLACE_WITH_ADMIN_EMAIL`. Это повысит аккаунт до `admin`.

## 6. ⛳️ Создание тренеров (после входа админом)
Тренеры **не регистрируются сами**. Админ создаёт их через приложение
(экран «Тренеры») — фронт вызывает Edge Function `create-coach` (service_role:
`auth.admin.createUser` + установка роли `coach`). Сгенерированный пароль
показывается админу один раз. Строка `coach_settings` создаётся автоматически
триггером.
> Edge Function `create-coach` нужно задеплоить: `supabase functions deploy create-coach`
> и задать секрет `SUPABASE_SERVICE_ROLE_KEY` (`supabase secrets set ...`).

## 7. ⛳️ Хостинг фронтенда — Cloudflare Pages
1. Запушьте репозиторий на GitHub (см. ниже «Git»).
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build`; Output dir: `dist`; корень: `frontend/`.
4. Переменные окружения проекта Pages: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
5. Получите адрес `*.pages.dev` → впишите его в Supabase **Site URL / Redirect URLs** (шаг 4).
   HTTPS обязателен для доступа к камере (сканирование QR).

## 8. 💤 Keep-alive против «засыпания» Supabase (free-tier)
Бесплатный проект Supabase встаёт на паузу после ~7 дней простоя. Настройте
внешний пинг **раз в 3 дня** (`KEEPALIVE_INTERVAL`): Cloudflare Worker Cron
Trigger или GitHub Actions cron → аутентифицированный лёгкий запрос к REST/RPC.
(Внутренний `pg_cron` для этого НЕ годится.)

## 9. 🅿️ Фаза 2 — хранилище фото и авто-удаление
- Создать **Storage bucket** `route-photos` (private) + Storage-политики (владелец = спортсмен).
- Задеплоить Edge Function `purge-photos` (зовёт `purge_expired_photos()` и удаляет объекты Storage).
- Включить расписание `pg_cron` (пример — в конце `0005_phase2_routes.sql`).

---

## Секреты — куда что класть
| Значение | Где используется | Куда положить |
|---|---|---|
| `VITE_SUPABASE_URL` | фронт | `frontend/.env`, переменные Cloudflare Pages |
| `VITE_SUPABASE_ANON_KEY` | фронт | `frontend/.env`, переменные Cloudflare Pages |
| `service_role key` | Edge Functions (create-coach, purge-photos) | `supabase secrets set` (НИКОГДА в гит) |
| Google Client ID/Secret | Supabase Auth | Supabase Dashboard |
