-- ============================================================================
-- boulder-coach — Migration 0003: Row-Level Security (SPEC §7.1)
-- Модель доступа:
--   * роль — через effective_role() (JWT-claim, иначе SECURITY DEFINER, без рекурсии);
--   * доступ тренера к данным спортсмена — ТОЛЬКО через активную связь has_active_link();
--   * мутации visits/memberships/coach_athlete/ledger — ТОЛЬКО через RPC (0002),
--     прямые INSERT/UPDATE/DELETE на них политиками не открыты → запрещены.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Привилегии уровня таблиц (RLS гейтит строки; без политики команда запрещена)
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on
  public.profiles, public.coach_settings, public.coach_athlete,
  public.memberships, public.visits, public.membership_ledger
  to authenticated;
-- notifications: клиент только читает свои и закрывает (dismiss). INSERT/DELETE — не нужны
-- (payment_reminder вычисляется из visits; материализация — через SECURITY DEFINER при необходимости).
grant select, update on public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Включить RLS
-- ---------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.coach_settings    enable row level security;
alter table public.coach_athlete     enable row level security;
alter table public.memberships       enable row level security;
alter table public.visits            enable row level security;
alter table public.membership_ledger enable row level security;
alter table public.notifications     enable row level security;

-- ===========================================================================
-- Гард: запрет смены роли/токена самим пользователем (роль меняет только admin
-- через app_set_role). Защита столбцов, которую RLS не выражает.
-- ===========================================================================
create or replace function public.guard_profiles_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    if new.role is distinct from old.role then
      raise exception 'ROLE_CHANGE_FORBIDDEN';
    end if;
    if new.athlete_qr_token is distinct from old.athlete_qr_token then
      raise exception 'QR_TOKEN_IMMUTABLE';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update before update on public.profiles
  for each row execute function public.guard_profiles_update();

-- ===========================================================================
-- profiles
-- ===========================================================================
-- читать: свою строку; admin — все; тренер — профиль своего активного спортсмена;
-- спортсмен — профиль тренера, у которого тренировался (любая связь, в т.ч. removed — история).
create policy profiles_select on public.profiles for select using (
  id = auth.uid()
  or public.is_admin()
  or public.has_active_link(auth.uid(), profiles.id)            -- я тренер этого athlete
  or exists (                                                   -- я athlete этого тренера (история)
       select 1 from public.coach_athlete ca
       where ca.coach_id = profiles.id and ca.athlete_id = auth.uid()
     )
);
-- обновлять: свою строку (гард выше запрещает смену роли/токена); admin — любую.
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- ===========================================================================
-- coach_settings — читает/меняет свой тренер; admin — все. Спортсмен НЕ читает
-- цену напрямую (сумма к оплате отдаётся через RPC app_my_payment_due, 0004).
-- ===========================================================================
create policy coach_settings_own on public.coach_settings for select
  using (coach_id = auth.uid() or public.is_admin());
create policy coach_settings_update on public.coach_settings for update
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

-- ===========================================================================
-- coach_athlete — чтение; запись только через RPC чек-ина.
-- ===========================================================================
create policy coach_athlete_select on public.coach_athlete for select using (
  public.is_admin()
  or (coach_id = auth.uid() and removed_at is null)             -- тренер: активный список
  or athlete_id = auth.uid()                                   -- спортсмен: вся история связей
);
-- мягкое удаление связи тренером (removed_at) — разрешаем прямой UPDATE своей строки
create policy coach_athlete_soft_delete on public.coach_athlete for update
  using (coach_id = auth.uid() or public.is_admin())
  with check (coach_id = auth.uid() or public.is_admin());

-- Гард: прямой UPDATE может только выставлять removed_at (мягкое удаление).
-- Реактивация (removed_at → NULL) и правка coach_id/athlete_id/created_at —
-- только через RPC (app_checkin ставит transaction-local флаг app.coach_athlete_rpc).
create or replace function public.guard_coach_athlete_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_admin() then return new; end if;
  if coalesce(current_setting('app.coach_athlete_rpc', true), '') = '1' then
    return new;                                  -- путь RPC (app_checkin) — разрешён
  end if;
  if new.coach_id   is distinct from old.coach_id
     or new.athlete_id is distinct from old.athlete_id
     or new.created_at is distinct from old.created_at then
    raise exception 'COACH_ATHLETE_IMMUTABLE_FIELDS';
  end if;
  if old.removed_at is not null and new.removed_at is null then
    raise exception 'COACH_ATHLETE_REACTIVATE_VIA_RPC_ONLY';
  end if;
  return new;
end $$;

drop trigger if exists coach_athlete_guard_update on public.coach_athlete;
create trigger coach_athlete_guard_update before update on public.coach_athlete
  for each row execute function public.guard_coach_athlete_update();

-- ===========================================================================
-- memberships — чтение; запись только через RPC.
-- ===========================================================================
create policy memberships_select on public.memberships for select using (
  public.is_admin()
  or athlete_id = auth.uid()                                   -- спортсмен: свои счётчики
  or (coach_id = auth.uid() and public.has_active_link(auth.uid(), athlete_id))  -- тренер: ТОЛЬКО своя активная пара
);

-- ===========================================================================
-- visits — чтение; ВСЕ мутации только через RPC (app_checkin/app_end_session).
-- ===========================================================================
create policy visits_select on public.visits for select using (
  public.is_admin()
  or athlete_id = auth.uid()                                   -- спортсмен: свои визиты
  or (coach_id = auth.uid() and public.has_active_link(auth.uid(), athlete_id))  -- тренер: ТОЛЬКО свои визиты с этим спортсменом
);

-- ===========================================================================
-- membership_ledger — чтение; запись только через RPC.
-- ===========================================================================
create policy ledger_select on public.membership_ledger for select using (
  public.is_admin()
  or athlete_id = auth.uid()
  or (coach_id = auth.uid() and public.has_active_link(auth.uid(), athlete_id))  -- тренер: ТОЛЬКО своя пара
);

-- ===========================================================================
-- notifications — пользователь видит и закрывает только свои.
-- ===========================================================================
create policy notifications_select on public.notifications for select
  using (user_id = auth.uid() or public.is_admin());
create policy notifications_update_self on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
