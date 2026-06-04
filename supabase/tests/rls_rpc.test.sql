-- Регрессионные тесты RLS/RPC. Запуск: bash supabase/tests/run.sh (Docker).
-- Прогон как НЕ-суперюзер (set role authenticated) с JWT-claims, чтобы RLS реально
-- применялась. Сидинг/ground-truth — как postgres (reset role).
-- Акторы: A=...0001 (coach), B=...0002 (coach), X=...0009 (athlete).
\set ON_ERROR_STOP on

\echo '== setup: users + roles (as postgres) =='
reset role;
insert into auth.users (id,email,raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001','coachA@x.io','{"full_name":"Coach A"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002','coachB@x.io','{"full_name":"Coach B"}'),
  ('cccccccc-0000-0000-0000-000000000009','athX@x.io','{"full_name":"Ath X"}');
select public.app_set_role_service('aaaaaaaa-0000-0000-0000-000000000001','coach');
select public.app_set_role_service('bbbbbbbb-0000-0000-0000-000000000002','coach');

-- ───────────────────────────────────────────────────────────────────────────
\echo '== TC1: чек-ин при нулевом абонементе + одна активная сессия =='
select public.test_login('aaaaaaaa-0000-0000-0000-000000000001','coach'); set role authenticated;
select public.app_checkin('cccccccc-0000-0000-0000-000000000009','membership');
select public.app_checkin('cccccccc-0000-0000-0000-000000000009','membership');  -- активная уже есть
reset role;
do $$
declare n int; dec boolean; rem int;
begin
  select count(*) into n from public.visits
    where coach_id='aaaaaaaa-0000-0000-0000-000000000001' and athlete_id='cccccccc-0000-0000-0000-000000000009';
  if n <> 1 then raise exception 'TC1 FAIL: ожидался 1 визит, получено %', n; end if;
  select membership_decremented into dec from public.visits
    where coach_id='aaaaaaaa-0000-0000-0000-000000000001' and athlete_id='cccccccc-0000-0000-0000-000000000009';
  if dec then raise exception 'TC1 FAIL: при остатке 0 не должно быть списания'; end if;
  select coalesce(remaining_visits,0) into rem from public.memberships
    where coach_id='aaaaaaaa-0000-0000-0000-000000000001' and athlete_id='cccccccc-0000-0000-0000-000000000009';
  if rem <> 0 then raise exception 'TC1 FAIL: остаток должен быть 0, получено %', rem; end if;
  raise notice 'TC1 OK';
end $$;

\echo '== TC1b: начисление + завершение + повторный чек-ин = списание =='
select public.test_login('aaaaaaaa-0000-0000-0000-000000000001','coach'); set role authenticated;
select public.app_grant_membership('cccccccc-0000-0000-0000-000000000009',3,null);
select id as vid from public.visits
  where coach_id='aaaaaaaa-0000-0000-0000-000000000001'
    and athlete_id='cccccccc-0000-0000-0000-000000000009' and ended_at is null \gset
select public.app_end_session(:'vid');
select public.app_checkin('cccccccc-0000-0000-0000-000000000009','membership');  -- списание 3→2
reset role;
do $$
declare rem int; n int;
begin
  select remaining_visits into rem from public.memberships
    where coach_id='aaaaaaaa-0000-0000-0000-000000000001' and athlete_id='cccccccc-0000-0000-0000-000000000009';
  select count(*) into n from public.visits
    where coach_id='aaaaaaaa-0000-0000-0000-000000000001' and athlete_id='cccccccc-0000-0000-0000-000000000009';
  if rem <> 2 then raise exception 'TC1b FAIL: остаток должен быть 2, получено %', rem; end if;
  if n <> 2 then raise exception 'TC1b FAIL: ожидалось 2 визита, получено %', n; end if;
  raise notice 'TC1b OK';
end $$;

-- ───────────────────────────────────────────────────────────────────────────
\echo '== TC2: RLS-изоляция между тренерами =='
select public.test_login('bbbbbbbb-0000-0000-0000-000000000002','coach'); set role authenticated;
select public.app_checkin('cccccccc-0000-0000-0000-000000000009','paid');   -- визит B с X
reset role;
select public.test_login('aaaaaaaa-0000-0000-0000-000000000001','coach'); set role authenticated;
do $$
declare coaches int;
begin
  select count(distinct coach_id) into coaches from public.visits
    where athlete_id='cccccccc-0000-0000-0000-000000000009';
  if coaches <> 1 then raise exception 'TC2 FAIL: тренер A видит чужие визиты (distinct coaches=%)', coaches; end if;
  raise notice 'TC2 OK: A видит только свои';
end $$;
reset role;
select public.test_login('cccccccc-0000-0000-0000-000000000009','athlete'); set role authenticated;
do $$
declare cnt int;
begin
  select count(*) into cnt from public.visits where athlete_id='cccccccc-0000-0000-0000-000000000009';
  if cnt <> 3 then raise exception 'TC2 FAIL: спортсмен должен видеть 3 визита, видит %', cnt; end if;
  raise notice 'TC2 OK: спортсмен видит все свои 3';
end $$;
reset role;

-- ───────────────────────────────────────────────────────────────────────────
\echo '== TC3: сумма к оплате + закрытие напоминания =='
select public.test_login('bbbbbbbb-0000-0000-0000-000000000002','coach'); set role authenticated;
update public.coach_settings set price_per_visit=300, show_payment_due=true
  where coach_id='bbbbbbbb-0000-0000-0000-000000000002';
reset role;
select public.test_login('cccccccc-0000-0000-0000-000000000009','athlete'); set role authenticated;
do $$
declare amt numeric;
begin
  select amount into amt from public.app_my_payment_due()
    where coach_id='bbbbbbbb-0000-0000-0000-000000000002';
  if amt is distinct from 300 then raise exception 'TC3 FAIL: к оплате ожидалось 300, получено %', amt; end if;
  raise notice 'TC3 OK: к оплате = 300';
end $$;
select public.app_dismiss_payment('bbbbbbbb-0000-0000-0000-000000000002');
do $$
declare cnt int;
begin
  select count(*) into cnt from public.app_my_payment_due();
  if cnt <> 0 then raise exception 'TC3 FAIL: после оплаты долг должен быть 0, есть %', cnt; end if;
  raise notice 'TC3 OK: долг закрыт';
end $$;
reset role;

-- ───────────────────────────────────────────────────────────────────────────
\echo '== TC4: эскалация закрыта (e-mail и роль неизменяемы) =='
select public.test_login('cccccccc-0000-0000-0000-000000000009','athlete'); set role authenticated;
do $$
begin
  update public.profiles set email='hack@x.io' where id='cccccccc-0000-0000-0000-000000000009';
  raise exception 'TC4 FAIL: смена e-mail не заблокирована';
exception when others then
  if sqlerrm like '%TC4 FAIL%' then raise; end if;
  raise notice 'TC4 OK: e-mail неизменяем (%)', sqlerrm;
end $$;
do $$
begin
  update public.profiles set role='admin' where id='cccccccc-0000-0000-0000-000000000009';
  raise exception 'TC4 FAIL: смена роли не заблокирована';
exception when others then
  if sqlerrm like '%TC4 FAIL%' then raise; end if;
  raise notice 'TC4 OK: роль неизменяема (%)', sqlerrm;
end $$;
reset role;

\echo 'ALL_DB_TESTS_PASSED'
