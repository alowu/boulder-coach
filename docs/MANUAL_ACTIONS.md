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

## 4. Настроить провайдеры входа
- **⛳️ Email/Password (обязательно):** Authentication → Providers → Email → включить;
  **выключить** «Confirm email» (SPEC 4.1.2 — подтверждение не требуется).
  Этого **достаточно**, чтобы приложение полностью работало.
- **💤 Google OAuth (опционально — можно пропустить):** это всего лишь кнопка
  «Войти через Google». Для запуска она **не нужна** и добавляется когда угодно позже.
  Если когда-нибудь захотите включить:
  1. Откройте https://console.cloud.google.com — это «Google Cloud Console», бесплатная
     панель Google для приложений, которым нужен вход через Google (вход вашим Google-аккаунтом).
  2. Создайте проект → **APIs & Services** → **OAuth consent screen** (заполните название/почту)
     → **Credentials** → **Create credentials** → **OAuth client ID** → тип **Web application**.
  3. Скопируйте **Client ID** и **Client Secret**.
  4. В поле **Authorized redirect URIs** добавьте: `https://<ref>.supabase.co/auth/v1/callback`
     (`<ref>` — идентификатор вашего проекта Supabase из его URL).
  5. В Supabase: Authentication → Providers → Google → включить, вставить Client ID / Secret.
- Настройте **Site URL** и **Redirect URLs** на адрес фронта (см. шаг 7).

## 5. ⛳️ Создать первого администратора
1. Зарегистрируйтесь в приложении как обычный пользователь (будущий админ).
2. В SQL Editor выполните `supabase/seed.sql`, подставив свой e-mail в
   `REPLACE_WITH_ADMIN_EMAIL`. Это повысит аккаунт до `admin`.

## 6. ⛳️ Создание тренеров (после входа админом)
**Поток MVP (работает сразу, без Edge Function):**
1. Будущий тренер **регистрируется** в приложении как обычный пользователь (по e-mail/паролю).
2. Вы (админ) на экране **«Тренеры»** вводите его e-mail → «Назначить» (или меняете роль на
   вкладке **«Пользователи»**). Роль становится `coach`, строка `coach_settings` создаётся
   автоматически триггером.

> 💤 Опционально на будущее: чтобы админ заводил тренеров с авто-сгенерированным паролем
> (как в SPEC 4.1.3), задеплойте Edge Function `create-coach` (service_role:
> `auth.admin.createUser` + `app_set_role`). Для MVP это не требуется.

## 6a. ▶️ Запустить приложение
```bash
cd frontend
npm install          # один раз
npm run dev          # откроется http://localhost:5173
```
`.env` с `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` уже создан. Теперь можно регистрироваться.

## 6b. 💤 Инвайты тренеров по e-mail (опционально)
Чтобы на вкладке «Тренеры» работала кнопка **«Пригласить»** (письмо-приглашение):
1. **Примените миграцию `0006_invite_fixes.sql`** (SQL Editor или `supabase db push`) — она
   добавляет безопасный серверный путь смены роли и закрывает эскалацию через e-mail.
2. **Разверните Edge Function `invite-coach`** одним из способов:
   - Дашборд: Supabase → **Edge Functions → Create function** → имя `invite-coach` →
     вставьте код из `supabase/functions/invite-coach/index.ts` → **Deploy**.
   - Или CLI: `supabase functions deploy invite-coach`.
   `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` Supabase пробрасывает в функцию автоматически —
   секреты вручную задавать не нужно.
3. Убедитесь, что в URL Configuration добавлен redirect `https://boulder-coach.pages.dev/**`
   (письмо-инвайт ведёт на `/set-password`).
> Без этого шага тренеров всё равно можно добавлять: пользователь регистрируется сам →
> вы меняете ему роль на вкладке «Пользователи».

## 6c. ✉️ Свой SMTP — ОБЯЗАТЕЛЬНО (встроенная почта Supabase ≈ 3–4 письма/сутки)
Встроенный отправитель Supabase годится только для теста. С включённым подтверждением
e-mail и инвайтами он быстро упирается в лимит. Подключите бесплатный SMTP-провайдер.

**Рекомендация: Brevo (бесплатно 300 писем/сутки, БЕЗ своего домена).**
1. Регистрация на https://www.brevo.com (бесплатно).
2. **Senders & IP → Senders → Add a sender**: укажите свой e-mail (напр. ilya28122010.28@gmail.com) →
   подтвердите по ссылке из письма. (Домен не нужен — достаточно одного подтверждённого отправителя.)
3. **SMTP & API → SMTP**: возьмите параметры:
   - Host `smtp-relay.brevo.com`, Port `587`
   - Login — показанный там e-mail/логин; Password — **Generate a new SMTP key**.
4. Supabase → **Authentication → Emails → SMTP settings → Enable Custom SMTP**:
   - Sender email — ваш подтверждённый отправитель; Sender name — `boulder-coach`.
   - Host `smtp-relay.brevo.com`, Port `587`, Username — логин Brevo, Password — SMTP-ключ.
5. Supabase → **Authentication → Rate Limits** → поднимите лимит «emails per hour» (по умолчанию низкий),
   т.к. теперь письма идут через нормальный SMTP.

Альтернативы: Resend (100/сутки, 3000/мес — но для «from вашего домена» нужен домен),
SendGrid (100/сутки), Amazon SES (дёшево и масштабируемо, чуть сложнее настройка).

## 6d. 🗑 Edge Function `delete-user` (удаление людей админом)
Чтобы на вкладке «Пользователи» работала кнопка **«Удалить»** (тренер уволился /
спортсмен перестал ходить): разверните функцию так же, как `invite-coach` —
Dashboard → **Edge Functions → Create function** → имя `delete-user` → вставьте код из
`supabase/functions/delete-user/index.ts` → **Deploy**. Удаление каскадно убирает профиль
и все связанные данные (визиты, абонементы, связи). Действие необратимо.

## 6e. 🅿️ Фаза 2 — применить миграцию трасс
Чтобы заработала вкладка **«Трассы»** (каталог + статистика по грейдам), примените
`supabase/migrations/0005_phase2_routes.sql` (SQL Editor или `supabase db push`).

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
| `service_role key` | Edge Functions (invite-coach, delete-user, purge-photos) | Supabase **сам** пробрасывает в Edge Functions как `SUPABASE_SERVICE_ROLE_KEY` — вручную задавать НЕ нужно; в гит НИКОГДА |
| SMTP-ключ (Brevo) | Auth → SMTP | Supabase Dashboard (см. 6c) |
| Google Client ID/Secret | Supabase Auth | Supabase Dashboard |
