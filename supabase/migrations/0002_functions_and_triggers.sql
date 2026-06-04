-- ============================================================================
-- boulder-coach — Migration 0002: триггеры, helper-функции, транзакционные RPC
-- Реализует SPEC §6.2 (RPC), §7.1 (helpers роли), а также аудит-исправления:
--   #2  материализация просроченной сессии в чек-ине;
--   #3  создание coach_settings при назначении роли coach;
--   #4  транзакционное начисление абонемента (RPC);
--   #15 идемпотентное завершение сессии (только при ended_at IS NULL).
-- Константа SESSION_AUTO_END = interval '2 hours' (SPEC §10).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Триггер: создание profiles при регистрации в auth.users
-- display_name: full_name|name из метаданных OAuth, иначе локальная часть email.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name',
             new.raw_user_meta_data->>'name',
             split_part(coalesce(new.email,''), '@', 1)),
    'athlete'                       -- 4.1.2: саморегистрация → роль athlete
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Триггер: гарантировать строку coach_settings при role = 'coach'  (Аудит #3)
-- ---------------------------------------------------------------------------
create or replace function public.ensure_coach_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'coach' then
    insert into public.coach_settings (coach_id) values (new.id)
    on conflict (coach_id) do nothing;       -- дефолты: price_per_visit=0, show_payment_due=false
  end if;
  return new;
end $$;

drop trigger if exists profiles_ensure_coach_settings on public.profiles;
create trigger profiles_ensure_coach_settings
  after insert or update of role on public.profiles
  for each row execute function public.ensure_coach_settings();

-- ---------------------------------------------------------------------------
-- Роль пользователя: читаем из JWT-claim (custom access token hook), иначе из
-- profiles через SECURITY DEFINER (без рекурсии RLS — Аудит/SPEC R9).
-- ---------------------------------------------------------------------------
create or replace function public.effective_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'user_role', ''),
    (select role::text from public.profiles where id = auth.uid())
  );
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.effective_role() = 'admin';
$$;

create or replace function public.is_coach()
returns boolean language sql stable security definer set search_path = public as $$
  select public.effective_role() = 'coach';
$$;

-- Активная (не мягко удалённая) связь пары — для RLS и RPC.
create or replace function public.has_active_link(p_coach uuid, p_athlete uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.coach_athlete
    where coach_id = p_coach and athlete_id = p_athlete and removed_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- Custom Access Token Hook — кладёт роль в claim user_role (SPEC R9).
-- Включается вручную в Supabase Dashboard → Auth → Hooks (см. MANUAL_ACTIONS.md).
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_claims jsonb;
  v_role   text;
begin
  select role::text into v_role from public.profiles where id = (event->>'user_id')::uuid;
  v_claims := coalesce(event->'claims', '{}'::jsonb);
  if v_role is not null then
    v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role));
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- ===========================================================================
-- RPC: ЧЕК-ИН (SPEC 4.3.1, 6.2). Транзакционно: upsert связи, init абонемента,
-- материализация своей просроченной сессии, правило одной активной сессии,
-- создание визита, списание абонемента.
-- ===========================================================================
create or replace function public.app_checkin(
  p_athlete uuid,
  p_visit_type public.visit_type
)
returns public.visits
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_role  text := public.effective_role();
  v_visit public.visits;
  v_remaining int;
begin
  if v_coach is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_role not in ('coach','admin') then
    raise exception 'FORBIDDEN_ONLY_COACH';
  end if;
  if not exists (select 1 from profiles where id = p_athlete and role = 'athlete') then
    raise exception 'ATHLETE_NOT_FOUND';        -- 4.2.3: чужой/не-athlete токен
  end if;

  -- 4.3.1.a/.b/.c — создать связь / реактивировать removed_at / no-op
  insert into coach_athlete (coach_id, athlete_id)
  values (v_coach, p_athlete)
  on conflict (coach_id, athlete_id)
    do update set removed_at = null
    where coach_athlete.removed_at is not null;

  -- 4.3.1.d — инициализация абонемента пары
  insert into memberships (coach_id, athlete_id, remaining_visits)
  values (v_coach, p_athlete, 0)
  on conflict (coach_id, athlete_id) do nothing;

  -- Аудит #2 — материализовать СВОЮ просроченную (>2ч) активную сессию пары
  update visits
     set ended_at = started_at + interval '2 hours', end_reason = 'auto'
   where coach_id = v_coach and athlete_id = p_athlete
     and ended_at is null
     and started_at <= now() - interval '2 hours';

  -- 4.3.1 — одна активная сессия на пару: если активная есть — вернуть её
  select * into v_visit from visits
   where coach_id = v_coach and athlete_id = p_athlete and ended_at is null
   limit 1;
  if found then
    return v_visit;                 -- UI: «тренировка уже идёт»
  end if;

  -- создать новый визит (старт = now())
  begin
    insert into visits (coach_id, athlete_id, visit_type)
    values (v_coach, p_athlete, p_visit_type)
    returning * into v_visit;
  exception when unique_violation then
    -- конкурентный чек-ин выиграл гонку — вернуть его активную сессию
    select * into v_visit from visits
      where coach_id = v_coach and athlete_id = p_athlete and ended_at is null
      limit 1;
    return v_visit;
  end;

  -- списание абонемента (только membership, только если остаток > 0)
  if p_visit_type = 'membership' then
    select remaining_visits into v_remaining
      from memberships
     where coach_id = v_coach and athlete_id = p_athlete
     for update;

    if coalesce(v_remaining, 0) > 0 then
      update memberships
         set remaining_visits = greatest(0, remaining_visits - 1)   -- формула SPEC 4.4.2
       where coach_id = v_coach and athlete_id = p_athlete;

      update visits set membership_decremented = true where id = v_visit.id;
      v_visit.membership_decremented := true;

      insert into membership_ledger (coach_id, athlete_id, delta, reason, visit_id, created_by)
      values (v_coach, p_athlete, -1, 'visit_decrement', v_visit.id, v_coach);
    end if;
    -- остаток 0 → membership_decremented остаётся false (4.3.2), визит засчитан
  end if;

  return v_visit;
end $$;

-- ===========================================================================
-- RPC: НАЧИСЛЕНИЕ АБОНЕМЕНТА (SPEC 4.4.3, Аудит #4). 1 ≤ N ≤ GRANT_MAX(100).
-- Требует активной связи пары. Транзакционно: += N + запись в ledger.
-- ===========================================================================
create or replace function public.app_grant_membership(
  p_athlete uuid,
  p_n integer
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_coach uuid := auth.uid();
  v_role  text := public.effective_role();
  v_new   integer;
begin
  if v_coach is null then raise exception 'AUTH_REQUIRED'; end if;
  if v_role <> 'coach' then raise exception 'FORBIDDEN_ONLY_COACH'; end if;
  if p_n is null or p_n < 1 or p_n > 100 then         -- GRANT_MAX = 100 (SPEC §10)
    raise exception 'INVALID_GRANT_N';
  end if;
  if not public.has_active_link(v_coach, p_athlete) then
    raise exception 'NO_ACTIVE_LINK';                 -- 4.4.4: мягко удалённой парой не управляют
  end if;

  insert into memberships (coach_id, athlete_id, remaining_visits)
  values (v_coach, p_athlete, 0)
  on conflict (coach_id, athlete_id) do nothing;

  update memberships
     set remaining_visits = remaining_visits + p_n
   where coach_id = v_coach and athlete_id = p_athlete
   returning remaining_visits into v_new;

  insert into membership_ledger (coach_id, athlete_id, delta, reason, created_by)
  values (v_coach, p_athlete, p_n, 'grant', v_coach);

  return v_new;
end $$;

-- ===========================================================================
-- RPC: ЗАВЕРШЕНИЕ СЕССИИ (SPEC 4.3.3, Аудит #15). Идемпотентно: применяется
-- только при ended_at IS NULL; повторное/конкурентное завершение — no-op.
-- end_reason вычисляется сервером по роли актора (клиенту не доверяем).
-- ===========================================================================
create or replace function public.app_end_session(p_visit uuid)
returns public.visits
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_role   text := public.effective_role();
  v_visit  public.visits;
  v_reason public.visit_end_reason;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_visit from visits where id = p_visit;
  if not found then raise exception 'VISIT_NOT_FOUND'; end if;

  -- авторизация + вычисление причины завершения
  v_reason := case
    when v_uid = v_visit.athlete_id then 'athlete'
    when v_uid = v_visit.coach_id   then 'coach'
    when v_role = 'admin'           then 'admin'
    else null
  end::public.visit_end_reason;
  if v_reason is null then raise exception 'FORBIDDEN'; end if;

  update visits
     set ended_at   = least(now(), started_at + interval '2 hours'),  -- SESSION_AUTO_END
         end_reason = v_reason
   where id = p_visit and ended_at is null
   returning * into v_visit;

  if not found then
    -- уже завершена — идемпотентный no-op: вернуть актуальное состояние
    select * into v_visit from visits where id = p_visit;
  end if;

  return v_visit;
end $$;

-- ===========================================================================
-- RPC: ЗАКРЫТИЕ НАПОМИНАНИЯ ОБ ОПЛАТЕ = «подтвердил оплату» (SPEC 4.5.4/4.6.3).
-- Спортсмен закрывает по конкретному тренеру → всем неоплаченным paid-визитам
-- пары проставляется payment_settled_at в одной транзакции.
-- ===========================================================================
create or replace function public.app_dismiss_payment(p_coach uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  update visits
     set payment_settled_at = now()
   where athlete_id = v_uid
     and coach_id = p_coach
     and visit_type = 'paid'
     and payment_settled_at is null;
  get diagnostics v_count = row_count;

  update notifications
     set dismissed_at = now()
   where user_id = v_uid
     and type = 'payment_reminder'
     and dismissed_at is null
     and (payload->>'coach_id') = p_coach::text;

  return v_count;
end $$;

-- ===========================================================================
-- RPC: НАЗНАЧЕНИЕ РОЛИ (admin-only). Создание coach_settings — через триггер.
-- ===========================================================================
create or replace function public.app_set_role(p_user uuid, p_role public.user_role)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.effective_role() <> 'admin' then raise exception 'FORBIDDEN'; end if;
  update profiles set role = p_role where id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Доступ к RPC для аутентифицированных пользователей (RLS внутри функций).
-- ---------------------------------------------------------------------------
grant execute on function public.app_checkin(uuid, public.visit_type)        to authenticated;
grant execute on function public.app_grant_membership(uuid, integer)         to authenticated;
grant execute on function public.app_end_session(uuid)                       to authenticated;
grant execute on function public.app_dismiss_payment(uuid)                   to authenticated;
grant execute on function public.app_set_role(uuid, public.user_role)        to authenticated;
grant execute on function public.effective_role()                            to authenticated;
grant execute on function public.is_admin()                                  to authenticated;
grant execute on function public.is_coach()                                  to authenticated;
grant execute on function public.has_active_link(uuid, uuid)                 to authenticated;
