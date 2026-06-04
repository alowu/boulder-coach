# boulder-coach — План реализации

> **Для агентов-исполнителей:** РЕКОМЕНДУЕМЫЙ ПОД-НАВЫК — `superpowers:subagent-driven-development` (свежий субагент на задачу) или `superpowers:executing-plans`. Шаги помечены чекбоксами (`- [ ]`).

**Цель:** довести boulder-coach от уже готовой схемы БД до рабочего MVP (адаптивный PWA-веб) и подготовить почву для Фазы 2.

**Архитектура:** SPA (Vite+React+TS) общается напрямую с Supabase (Auth + PostgREST + RPC). Вся транзакционная логика и контроль доступа — на стороне БД (RLS + SECURITY DEFINER RPC из `supabase/migrations`). Привилегированные операции (создание тренера, очистка фото) — Edge Functions с service_role. Хостинг фронта — Cloudflare Pages.

**Tech Stack:** Vite, React 18, TypeScript, Tailwind, shadcn/ui, `@supabase/supabase-js`, `qrcode`, `@zxing/browser`, `vite-plugin-pwa`, Vitest + React Testing Library, (опц.) Playwright, pgTAP для тестов БД.

**Статус бэкенда:** миграции `0001–0004` (MVP) и `0005` (Фаза 2) готовы. Критерии приёмки — см. `SPEC.md §10`.

---

## Карта файлов (frontend/)
```
frontend/
├── index.html
├── vite.config.ts                 # + vite-plugin-pwa
├── tailwind.config.js, postcss.config.js
├── tsconfig.json, .eslintrc, .prettierrc
├── .env                           # из .env.example (gitignored)
└── src/
    ├── main.tsx, App.tsx, router.tsx
    ├── lib/
    │   ├── supabase.ts            # клиент Supabase
    │   ├── database.types.ts      # типы из supabase gen types
    │   └── format.ts              # formatDuration(M) → «X минут (~Hч Mrмин)»
    ├── auth/
    │   ├── AuthProvider.tsx       # сессия + роль
    │   ├── useAuth.ts
    │   └── ProtectedRoute.tsx     # гард по роли
    ├── api/                       # тонкие обёртки над RPC/таблицами
    │   ├── checkin.ts, sessions.ts, memberships.ts, payments.ts,
    │   ├── athletes.ts, settings.ts, admin.ts, stats.ts
    ├── components/                # shadcn/ui + общие (QRView, Scanner, ReminderDialog…)
    ├── features/
    │   ├── auth/ (Login, Register, ResetPassword)
    │   ├── athlete/ (MyQr, MyCalendar, MyStats, MyCoaches, MyDues)
    │   ├── coach/ (Scan, CheckinDialog, AthletesList, AthleteDetail, CoachSettings, BackdateVisit)
    │   └── admin/ (Coaches, Users, Roles)
    └── test/setup.ts

supabase/functions/
├── create-coach/index.ts          # service_role: создать тренера
└── purge-photos/index.ts          # Фаза 2: удалить объекты Storage
```

---

## Фаза 0 — Каркас проекта и инфраструктура

### Task 0.1: Скаффолд фронтенда
**Files:** Create `frontend/*` (Vite scaffold)

- [ ] **Step 1: Создать проект**
```bash
cd frontend && npm create vite@latest . -- --template react-ts
npm install
```
- [ ] **Step 2: Установить зависимости**
```bash
npm i @supabase/supabase-js qrcode @zxing/browser
npm i -D tailwindcss postcss autoprefixer vite-plugin-pwa vitest @testing-library/react @testing-library/jest-dom jsdom @types/qrcode
npx tailwindcss init -p
```
- [ ] **Step 3: Инициализировать shadcn/ui** (Tailwind preset, базовые компоненты button/input/dialog/card/table/toast)
```bash
npx shadcn@latest init
npx shadcn@latest add button input dialog card table toast badge calendar
```
- [ ] **Step 4: Настроить Tailwind** (`content: ['./index.html','./src/**/*.{ts,tsx}']`), русскую локаль `<html lang="ru">`.
- [ ] **Step 5: Commit** — `chore(frontend): scaffold Vite+React+TS+Tailwind+shadcn`

**Acceptance:** `npm run dev` поднимает пустую страницу без ошибок консоли.

### Task 0.2: Клиент Supabase и типы
**Files:** Create `src/lib/supabase.ts`, `src/lib/database.types.ts`

- [ ] **Step 1: Сгенерировать типы из БД**
```bash
supabase gen types typescript --project-id <ref> --schema public > src/lib/database.types.ts
```
- [ ] **Step 2: Создать клиент**
```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { persistSession: true, autoRefreshToken: true } }
)
```
- [ ] **Step 3: Commit** — `feat(frontend): add supabase client and generated types`

### Task 0.3: Утилита формата длительности (TDD)
**Files:** Create `src/lib/format.ts`, `src/lib/format.test.ts`

- [ ] **Step 1: Failing test**
```ts
import { formatDuration } from './format'
test('formats minutes with hours/minutes (SPEC 4.3.5)', () => {
  expect(formatDuration(95)).toBe('тренировка 95 минут (~1ч 35мин)')
  expect(formatDuration(60)).toBe('тренировка 60 минут (~1ч 0мин)')
  expect(formatDuration(0)).toBe('тренировка 0 минут (~0ч 0мин)')
})
```
- [ ] **Step 2: Run** `npx vitest run src/lib/format.test.ts` → FAIL.
- [ ] **Step 3: Implement**
```ts
// src/lib/format.ts
export function formatDuration(totalMinutes: number): string {
  const M = Math.max(0, Math.floor(totalMinutes))
  const H = Math.floor(M / 60)
  const Mr = M % 60
  return `тренировка ${M} минут (~${H}ч ${Mr}мин)`
}
```
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `feat(frontend): duration formatter (SPEC 4.3.5)`

### Task 0.4: PWA
**Files:** Modify `vite.config.ts`; add icons in `public/`

- [ ] **Step 1:** Подключить `vite-plugin-pwa` с `registerType:'autoUpdate'`, manifest (name «boulder-coach», lang `ru`, иконки 192/512, `display:'standalone'`).
- [ ] **Step 2:** `npm run build && npm run preview`, проверить установку PWA в Chrome (Application → Manifest).
- [ ] **Step 3: Commit** — `feat(frontend): installable PWA`

**Acceptance:** в Chrome доступна установка приложения; SW регистрируется.

---

## Фаза 1 — Авторизация и роли

### Task 1.1: AuthProvider + useAuth
**Files:** Create `src/auth/AuthProvider.tsx`, `src/auth/useAuth.ts`

- [ ] **Step 1:** Контекст хранит `session`, `user`, `role` (`'admin'|'coach'|'athlete'|null`), `loading`. Роль читается из JWT-claim `user_role`, фолбэк — `select role from profiles where id=auth.uid()`.
```ts
// ключевой фрагмент получения роли
function roleFromSession(session: Session | null): Role | null {
  const claim = (session?.user?.app_metadata as any)?.user_role
    ?? (session ? JSON.parse(atob(session.access_token.split('.')[1])).user_role : null)
  return (claim as Role) ?? null
}
// подписка: supabase.auth.onAuthStateChange(...) → set session; если claim пуст,
// дозапросить profiles.role.
```
- [ ] **Step 2:** `useAuth()` бросает понятную ошибку вне провайдера.
- [ ] **Step 3: Commit** — `feat(auth): session + role provider`

**Acceptance:** после входа `role` определяется и до настройки JWT-hook (через `profiles`), и после (через claim).

### Task 1.2: ProtectedRoute (TDD на гард)
**Files:** Create `src/auth/ProtectedRoute.tsx`, `src/auth/ProtectedRoute.test.tsx`

- [ ] **Step 1: Failing test** — рендер с `role='athlete'` и `allow={['coach']}` редиректит на `/`; с `allow={['athlete']}` — рендерит children. (Мокать `useAuth`.)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — `if(loading) return <Spinner/>; if(!session) return <Navigate to="/login"/>; if(allow && !allow.includes(role)) return <Navigate to="/"/>; return children`.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** — `feat(auth): role-based route guard`

### Task 1.3: Экраны входа/регистрации/сброса
**Files:** Create `src/features/auth/{Login,Register,ResetPassword}.tsx`

- [ ] **Login:** e-mail+пароль (`signInWithPassword`) и «Войти через Google» (`signInWithOAuth({provider:'google'})`). Ошибки/отмена OAuth → возврат на форму с тостом (SPEC 4.1).
- [ ] **Register:** только e-mail+пароль (`signUp`), поле «Имя» → `options.data.full_name` (→ `display_name`). Без подтверждения почты. Дубликат e-mail → нейтральное сообщение (анти-энумерация).
- [ ] **ResetPassword:** `resetPasswordForEmail`; сообщение «если вы не запрашивали — ничего делать не нужно» показывается всегда.
- [ ] **Commit** — `feat(auth): login/register/reset screens`

**Acceptance (SPEC §10 / 4.1):** регистрация создаёт `profiles` с ролью `athlete` и `display_name`; вход обоими способами работает; сброс не раскрывает существование аккаунта.

### Task 1.4: Каркас приложения и маршрутизация
**Files:** Create `src/router.tsx`, `src/App.tsx`, общий layout с нижней навигацией (мобайл-first)

- [ ] Маршруты по ролям: athlete (`/qr`,`/calendar`,`/stats`,`/coaches`,`/dues`), coach (`/scan`,`/athletes`,`/settings`), admin (`/admin/*`). Редирект «/» по роли.
- [ ] **Commit** — `feat(app): role-aware routing and layout`

---

## Фаза 2 — Спортсмен

### Task 2.1: Мой QR
**Files:** Create `src/features/athlete/MyQr.tsx`, `src/components/QRView.tsx`

- [ ] Прочитать `profiles.athlete_qr_token` (RLS: своя строка). Сгенерировать QR из `bcoach://athlete/<token>` (`qrcode.toDataURL`). Кнопки «Скачать PNG» и «Печать». Показать пояснение «работает офлайн».
- [ ] **Commit** — `feat(athlete): static QR with download/print`

**Acceptance (4.2.1/4.2.2):** QR кодирует токен (не `id`), стабилен между перезагрузками, скачивается.

### Task 2.2: Мой календарь и статистика
**Files:** `src/features/athlete/{MyCalendar,MyStats}.tsx`, `src/api/stats.ts`

- [ ] Календарь: запрос `v_visits` по `athlete_id=self`, отметки по дням; карточка визита показывает тренера, тип визита, `formatDuration(duration_minutes)`, статус `is_active` («тренировка идёт»).
- [ ] Статистика: RPC `app_my_stats()` (визиты, суммарная/средняя длительность, период).
- [ ] **Commit** — `feat(athlete): calendar and stats`

### Task 2.3: Мои тренеры и завершение своей сессии
**Files:** `src/features/athlete/MyCoaches.tsx`, `src/api/sessions.ts`

- [ ] Список тренеров из `coach_athlete` (история, incl. removed) + `profiles.display_name`.
- [ ] Если есть активные сессии — кнопка «Завершить тренировку»; при N>1 — выбор из списка; вызов RPC `app_end_session(visitId)`; идемпотентность (повтор → актуальное состояние без ошибки).
- [ ] **Commit** — `feat(athlete): coaches list + end own session`

**Acceptance (4.3.3, §10):** завершение применяется только к активной; повторное — no-op.

### Task 2.4: Напоминание об оплате (повторяющееся)
**Files:** `src/features/athlete/MyDues.tsx`, `src/components/ReminderDialog.tsx`, `src/api/payments.ts`

- [ ] При каждом входе/маунте приложения вызывать RPC `app_my_payment_due()`. Если есть строки — показать модалку с перечнем «Тренер N — к оплате X».
- [ ] Кнопка «Я оплатил(а)» по тренеру → RPC `app_dismiss_payment(coachId)` → строка исчезает; сумма → 0.
- [ ] Пока не закрыл — модалка появляется снова при следующем входе.
- [ ] **Commit** — `feat(athlete): recurring payment reminder`

**Acceptance (4.5.4/4.6.3, §10):** закрытие проставляет `payment_settled_at` всем неоплаченным paid-визитам пары; напоминание исчезает.

---

## Фаза 3 — Тренер

### Task 3.1: Хук сканера QR
**Files:** Create `src/components/Scanner.tsx`, `src/hooks/useZxingScanner.ts`

- [ ] **Step 1:** Через `@zxing/browser` (`BrowserQRCodeReader.decodeFromVideoDevice`) на `<video>`; запрос камеры `getUserMedia` (только HTTPS). Освобождать поток при размонтировании.
```ts
const reader = new BrowserQRCodeReader()
const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (res, err) => {
  if (res) onText(res.getText())   // ожидаем 'bcoach://athlete/<token>'
})
return () => controls.stop()
```
- [ ] **Step 2:** Парсер payload: извлечь токен из `bcoach://athlete/<uuid>`; невалидный формат → колбэк ошибки.
- [ ] **Commit** — `feat(coach): zxing QR scanner`

### Task 3.2: Чек-ин с обработкой ошибок
**Files:** `src/features/coach/{Scan,CheckinDialog}.tsx`, `src/api/checkin.ts`

- [ ] Резолв токена через RPC **`app_resolve_qr(token)`** (уже есть в `0002`): возвращает `athlete_id` (или NULL) только для coach/admin. По `athlete_id` подтянуть `display_name` из `profiles` (RLS даст доступ после первого скана/связи).
- [ ] CheckinDialog: выбор типа визита (по абонементу / разовый) → RPC `app_checkin(athleteId, visitType)`.
- [ ] **Обработка ошибок (4.2.3, §10):** невалидный/чужой/не-athlete токен → «QR не распознан» (нейтрально); если RPC вернул существующую активную сессию → «тренировка уже идёт»; сетевая ошибка → тост + повтор.
- [ ] **Commit** — `feat(coach): scan→checkin flow with error handling`

**Acceptance (4.3.1/4.3.2):** повторный скан активной пары не создаёт визит и не списывает абонемент; при остатке 0 визит засчитан, счётчик не ушёл в минус.

### Task 3.3: Список спортсменов и карточка спортсмена
**Files:** `src/features/coach/{AthletesList,AthleteDetail}.tsx`, `src/api/athletes.ts`

- [ ] Список: активные связи (`coach_athlete.removed_at is null`) + имя + остаток абонемента (`memberships`) + (если включено) сумма к оплате (`app_coach_due`).
- [ ] Карточка: история визитов пары, кнопки «Начислить абонемент» (RPC `app_grant_membership`, 1..100), «Завершить активную» (RPC `app_end_session`), «Удалить из списка» (мягкое: `update coach_athlete set removed_at=now()`).
- [ ] **Commit** — `feat(coach): athletes list and detail`

**Acceptance (4.4.3/5.3):** начисление атомарно меняет счётчик + ledger; мягкое удаление убирает спортсмена из списка и доступа (RLS), история сохраняется.

### Task 3.4: Визит задним числом
**Files:** `src/features/coach/BackdateVisit.tsx`

- [ ] Форма: спортсмен (из своего списка или скан), `started_at` (в прошлом) + `ended_at`/длительность, тип визита. Валидация обязательности обоих полей. **Backend:** RPC **`app_backdate_visit(athlete, started_at, ended_at, visit_type)`** уже есть в `0002` (создаёт завершённый визит `is_backdated=true`, `end_reason='coach'`, списание по правилам, без правила одной активной сессии).
- [ ] **Commit** — `feat(coach): backdated visit`

**Acceptance (4.3.8, §10):** при отсутствии `started_at`/`ended_at` операция отклоняется; визит создаётся завершённым.

### Task 3.5: Настройки тренера
**Files:** `src/features/coach/CoachSettings.tsx`, `src/api/settings.ts`

- [ ] Чтение/запись `coach_settings` (своя строка): `price_per_visit`, `show_payment_due`. Подсказка: при цене 0 сумма к оплате не показывается.
- [ ] **Commit** — `feat(coach): settings (price, show payment due)`

---

## Фаза 4 — Администратор

### Task 4.1: Edge Function create-coach
**Files:** Create `supabase/functions/create-coach/index.ts`

- [ ] **Step 1:** Проверить вызывающего: извлечь JWT, убедиться `effective_role()='admin'` (вызвать RPC под токеном вызывающего ИЛИ проверить claim). Затем service-role клиентом `auth.admin.createUser({email, password, email_confirm:true})`, после — `app_set_role(newId,'coach')` (триггер создаст `coach_settings`).
```ts
// псевдо-каркас
const { email } = await req.json()
// 1) verify caller is admin (anon client with caller JWT → rpc effective_role)
// 2) const admin = createClient(URL, SERVICE_ROLE)
// 3) const pwd = crypto.randomUUID().slice(0,12)
// 4) const { data } = await admin.auth.admin.createUser({ email, password: pwd, email_confirm: true })
// 5) await admin.rpc('app_set_role', { p_user: data.user.id, p_role: 'coach' })
// 6) return { email, password: pwd }   // показать админу один раз
```
- [ ] **Step 2: Deploy** `supabase functions deploy create-coach`; `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`
- [ ] **Commit** — `feat(admin): create-coach edge function`

**Acceptance (4.1.3, §10):** только админ создаёт тренера; пароль показывается один раз; `coach_settings` создан.

### Task 4.2: Экраны админа
**Files:** `src/features/admin/{Coaches,Users,Roles}.tsx`, `src/api/admin.ts`

- [ ] Создание тренера (вызов Edge Function, показ пароля один раз), список пользователей, смена роли (RPC `app_set_role`), редактирование настроек тренеров.
- [ ] **Commit** — `feat(admin): coaches/users/roles screens`

---

## Фаза 5 — Полировка MVP
- [ ] Состояния загрузки/ошибки/пусто на всех экранах; тосты на ошибки RPC.
- [ ] Адаптивная проверка на телефоне и десктопе; нижняя навигация на мобайле.
- [ ] (Опц., 8.1.1) `session_ended`-уведомление; ручной ввод токена при недоступной камере; `must_change_password`.
- [ ] **Commit** — `polish: states, responsive, optional UX`

---

## Тестирование

### T1: Тесты БД (RLS/RPC) — pgTAP (рекомендуется)
**Files:** `supabase/tests/*.sql`

- [ ] **Изоляция тренера:** тренер A не видит визиты спортсмена, с которым нет активной связи; видит — только после `app_checkin`; теряет доступ после `removed_at`.
- [ ] **Нулевой абонемент:** `app_checkin(..., 'membership')` при остатке 0 → визит создан, `membership_decremented=false`, счётчик 0.
- [ ] **Одна активная сессия:** второй `app_checkin` той же пары возвращает существующую, новый визит не создан.
- [ ] **Просроченная сессия:** активная >2ч + новый `app_checkin` → старая закрыта `auto`, новая создана.
- [ ] **Начисление:** `app_grant_membership(...,5)` → счётчик +5 и строка ledger; `N=0`/`N=101`/без связи → исключение.
- [ ] **Сумма к оплате:** `app_my_payment_due` считает только неоплаченные paid × цену; membership исключён; `show_payment_due=false` → пусто.
- [ ] **Закрытие напоминания:** `app_dismiss_payment` проставляет `payment_settled_at`, сумма → 0.
- [ ] Запуск: `supabase test db`.
- [ ] **Commit** — `test(db): pgTAP coverage for RLS and RPC (SPEC §10)`

### T2: Компонентные тесты — Vitest + RTL
- [ ] `formatDuration` (готово в 0.3), `ProtectedRoute` (1.2), парсер QR-payload, `ReminderDialog` (показ/закрытие).
- [ ] **Commit** — `test(frontend): unit/component tests`

### T3 (опц.): e2e — Playwright
- [ ] Сценарий: тренер сканирует QR (мок камеры/ручной ввод) → чек-ин по абонементу → счётчик уменьшился; спортсмен видит визит в календаре.

---

## Self-review (соответствие спеке)
- Покрытие §4.1–4.9: auth (1.x), QR/скан (2.1,3.1–3.2), сессии (2.3,3.x), абонементы (3.3), деньги/напоминания (2.4,3.5), календарь/статистика (2.2), админка (4.x). ✔
- §5/5.A модель данных — миграции 0001/0005. ✔
- §7 RLS — миграция 0003 + тесты T1. ✔
- §10 критерии приёмки — отражены в «Acceptance» задач и тестах T1. ✔
- Backend полностью покрыт миграциями `0001–0004` (MVP): RPC `app_checkin`, `app_grant_membership`, `app_end_session`, `app_dismiss_payment`, `app_set_role`, `app_resolve_qr`, `app_backdate_visit`; функции `app_my_payment_due`, `app_coach_due`, `app_my_stats`, `visit_minutes`; представление `v_visits`. Отдельная миграция 0006 не требуется.

---

## Передача в исполнение
План сохранён в `docs/IMPLEMENTATION_PLAN.md`. Два варианта запуска:
1. **Субагент на задачу (рекомендуется)** — свежий субагент на каждую Task, ревью между задачами (`superpowers:subagent-driven-development`).
2. **Инлайн** — выполнение в текущей сессии батчами с чекпоинтами (`superpowers:executing-plans`).
