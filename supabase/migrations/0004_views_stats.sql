-- ============================================================================
-- boulder-coach — Migration 0004: расчётные функции, представления, статистика
-- SPEC 4.3.4 (единая формула длительности), 4.5.3 (сумма к оплате), 4.7 (стат.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Единый источник истины длительности (SPEC 4.3.4):
--   завершённая: ended_at - started_at
--   активная:    LEAST(now(), started_at + SESSION_AUTO_END) - started_at
-- Возвращает целое число минут (M). Формат «X минут (~Hч Mrмин)» — на клиенте:
--   M = duration_minutes; H = M / 60; Mr = M % 60.
-- ---------------------------------------------------------------------------
create or replace function public.visit_minutes(p_started timestamptz, p_ended timestamptz)
returns integer language sql stable as $$
  select greatest(0, floor(extract(epoch from (
           coalesce(p_ended, least(now(), p_started + interval '2 hours')) - p_started
         )) / 60)::int);
$$;

-- Представление визитов с длительностью и флагом активности (RLS наследуется).
create or replace view public.v_visits
  with (security_invoker = true) as
select
  v.*,
  (v.ended_at is null)                              as is_active,
  public.visit_minutes(v.started_at, v.ended_at)    as duration_minutes
from public.visits v;

grant select on public.v_visits to authenticated;

-- ---------------------------------------------------------------------------
-- Сумма к оплате спортсмену по каждому тренеру (SPEC 4.5.3/4.5.5).
-- Только тренеры с show_payment_due=true и суммой > 0. Спортсмен НЕ читает
-- coach_settings напрямую — данные отдаёт эта SECURITY DEFINER функция.
-- ---------------------------------------------------------------------------
create or replace function public.app_my_payment_due()
returns table (coach_id uuid, coach_name text, unpaid_visits integer, amount numeric)
language sql stable security definer set search_path = public as $$
  select v.coach_id,
         p.display_name,
         count(*)::int                          as unpaid_visits,
         (count(*) * cs.price_per_visit)        as amount
  from public.visits v
  join public.coach_settings cs on cs.coach_id = v.coach_id
  join public.profiles p        on p.id = v.coach_id
  where v.athlete_id = auth.uid()
    and v.visit_type = 'paid'
    and v.payment_settled_at is null
    and cs.show_payment_due = true
  group by v.coach_id, p.display_name, cs.price_per_visit
  having (count(*) * cs.price_per_visit) > 0;
$$;
grant execute on function public.app_my_payment_due() to authenticated;

-- ---------------------------------------------------------------------------
-- Сумма к оплате тренеру по конкретному спортсмену (для экрана тренера).
-- Видна только при активной связи; учитывает show_payment_due тренера.
-- ---------------------------------------------------------------------------
create or replace function public.app_coach_due(p_athlete uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((
    select count(v.id) * cs.price_per_visit            -- count(v.id): NULL-строка LEFT JOIN даёт 0
    from public.coach_settings cs
    left join public.visits v
      on v.coach_id = cs.coach_id
     and v.athlete_id = p_athlete
     and v.visit_type = 'paid'
     and v.payment_settled_at is null
    where cs.coach_id = auth.uid()
      and public.has_active_link(auth.uid(), p_athlete)
    group by cs.price_per_visit
  ), 0);                                                -- внешний coalesce: нет группы → 0
$$;
grant execute on function public.app_coach_due(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Базовая статистика спортсмена (SPEC 4.7.1): число визитов, суммарная/средняя
-- длительность, активность за период. Грейд-метрики — Фаза 2 (см. 0005).
-- ---------------------------------------------------------------------------
create or replace function public.app_my_stats()
returns table (
  total_visits     integer,
  total_minutes    integer,
  avg_minutes      numeric,
  first_visit      timestamptz,
  last_visit       timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    count(*)::int,
    coalesce(sum(public.visit_minutes(started_at, ended_at)), 0)::int,
    round(coalesce(avg(public.visit_minutes(started_at, ended_at)), 0), 1),
    min(started_at),
    max(started_at)
  from public.visits
  where athlete_id = auth.uid();
$$;
grant execute on function public.app_my_stats() to authenticated;
