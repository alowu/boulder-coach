-- ============================================================================
-- boulder-coach — Migration 0001: схема MVP (PostgreSQL / Supabase)
-- Реализует раздел 5 SPEC.md (MVP). Сущности Фазы 2 — в 0005_phase2_routes.sql.
-- Именованные константы (SPEC §9): SESSION_AUTO_END = 2 часа.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Перечисления (enum)
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.user_role        as enum ('admin', 'coach', 'athlete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visit_type       as enum ('membership', 'paid');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.visit_end_reason as enum ('athlete', 'coach', 'admin', 'auto');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_type as enum ('payment_reminder', 'session_ended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.ledger_reason     as enum ('grant', 'visit_decrement', 'adjust');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Утилита: автообновление updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5.1 profiles — прикладной профиль 1:1 к auth.users
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  role                 public.user_role not null default 'athlete',
  display_name         text,
  email                text,
  -- 4.2.2: непубличный токен для QR, НЕ равен id; генерируется всем, используется у спортсменов
  athlete_qr_token     uuid not null default gen_random_uuid(),
  must_change_password boolean not null default false,  -- 8.1.1 (опц.)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint profiles_qr_token_unique unique (athlete_qr_token)
);
create index if not exists profiles_role_idx on public.profiles (role);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

comment on column public.profiles.display_name is
  'Источник (SPEC 5.1): e-mail-регистрация — поле формы; Google OAuth — claim name (fallback email); тренер — задаёт админ; редактируется в настройках; пустое → отображать email.';

-- ---------------------------------------------------------------------------
-- 5.2 coach_settings — настройки тренера (создаётся при назначении роли coach)
-- Аудит #3/#32: price_per_visit NOT NULL DEFAULT 0; строка создаётся триггером.
-- ---------------------------------------------------------------------------
create table if not exists public.coach_settings (
  coach_id         uuid primary key references public.profiles (id) on delete cascade,
  price_per_visit  numeric(10,2) not null default 0 check (price_per_visit >= 0),
  show_payment_due boolean       not null default false,
  updated_at       timestamptz   not null default now()
);

drop trigger if exists coach_settings_set_updated_at on public.coach_settings;
create trigger coach_settings_set_updated_at before update on public.coach_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5.3 coach_athlete — связь тренер↔спортсмен (мягкое удаление через removed_at)
-- ---------------------------------------------------------------------------
create table if not exists public.coach_athlete (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  constraint coach_athlete_unique unique (coach_id, athlete_id),
  constraint coach_athlete_distinct check (coach_id <> athlete_id)
);
create index if not exists coach_athlete_active_coach_idx
  on public.coach_athlete (coach_id) where removed_at is null;
create index if not exists coach_athlete_athlete_idx
  on public.coach_athlete (athlete_id);

-- ---------------------------------------------------------------------------
-- 5.4 memberships — счётчик абонемента на пару (тренер, спортсмен)
-- ---------------------------------------------------------------------------
create table if not exists public.memberships (
  id               uuid primary key default gen_random_uuid(),
  coach_id         uuid not null references public.profiles (id) on delete cascade,
  athlete_id       uuid not null references public.profiles (id) on delete cascade,
  remaining_visits integer not null default 0 check (remaining_visits >= 0),
  updated_at       timestamptz not null default now(),
  constraint memberships_pair_unique unique (coach_id, athlete_id)
);

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5.5 visits — визиты = сессии тренировки (1:1)
-- ---------------------------------------------------------------------------
create table if not exists public.visits (
  id                     uuid primary key default gen_random_uuid(),
  coach_id               uuid not null references public.profiles (id) on delete cascade,
  athlete_id             uuid not null references public.profiles (id) on delete cascade,
  visit_type             public.visit_type not null,
  started_at             timestamptz not null default now(),
  ended_at               timestamptz,
  end_reason             public.visit_end_reason,
  is_backdated           boolean not null default false,
  membership_decremented boolean not null default false,
  payment_settled_at     timestamptz,
  created_at             timestamptz not null default now(),
  constraint visits_ended_after_start check (ended_at is null or ended_at >= started_at),
  -- payment_settled_at имеет смысл только для платных визитов
  constraint visits_paid_settle check (payment_settled_at is null or visit_type = 'paid')
);
create index if not exists visits_athlete_started_idx on public.visits (athlete_id, started_at desc);
create index if not exists visits_coach_started_idx   on public.visits (coach_id, started_at desc);
create index if not exists visits_athlete_active_idx   on public.visits (athlete_id) where ended_at is null;
create index if not exists visits_due_idx              on public.visits (coach_id, athlete_id) where payment_settled_at is null;
-- 4.3.1 / Аудит #2: не более одной АКТИВНОЙ сессии на пару
create unique index if not exists visits_one_active_per_pair
  on public.visits (coach_id, athlete_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- 5.7 membership_ledger — журнал движений абонемента (аудит начислений/списаний)
-- ---------------------------------------------------------------------------
create table if not exists public.membership_ledger (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  delta      integer not null check (delta <> 0),
  reason     public.ledger_reason not null,
  visit_id   uuid references public.visits (id) on delete set null,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index if not exists membership_ledger_pair_idx
  on public.membership_ledger (coach_id, athlete_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5.6 notifications — in-app уведомления (опционально; источник суммы — visits)
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  type         public.notification_type not null,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz
);
create index if not exists notifications_active_idx
  on public.notifications (user_id) where dismissed_at is null;

comment on table public.notifications is
  'SPEC 4.6.4: единый источник истины суммы к оплате — visits.payment_settled_at. notifications хранит лишь UI-состояние/лог.';
