-- ============================================================================
-- boulder-coach — Migration 0005: ФАЗА 2 (трассы, статистика, опц. фото)
-- SPEC §4.8, §5.A. Применять ТОЛЬКО при старте Фазы 2.
-- Ядро Фазы 2 — статистика по трассам. Фото — опционально, «на память».
-- Константы (SPEC §9): PHOTO_RETENTION = interval '3 months'.
-- ============================================================================

do $$ begin
  create type public.route_plane  as enum
    ('1','2','3','4','5','6','7','8','9','10','11','12','cave');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.route_status as enum ('top','flash','attempt');
exception when duplicate_object then null; end $$;

-- 5.A.1 routes — каталог трасс
create table if not exists public.routes (
  id           uuid primary key default gen_random_uuid(),
  wall_color   text,                               -- цвет/категория (ориентир грейда)
  grade_french text,                               -- задаётся вручную: 4C…7B+
  hold_color   text,                               -- цвет зацепок (для color-splash)
  plane        public.route_plane not null,        -- 1–12 или 'cave' (пещера)
  is_active    boolean not null default true,      -- снята при перекрутке
  created_at   timestamptz not null default now()
);
create index if not exists routes_active_idx on public.routes (is_active);

-- 5.A.2 color_grade_map — справочник цвет → диапазон грейда (подсказка/валидация)
create table if not exists public.color_grade_map (
  wall_color text primary key,
  grade_min  text not null,
  grade_max  text not null
);
insert into public.color_grade_map (wall_color, grade_min, grade_max) values
  ('white','4C','4C'), ('yellow','5A','5B'), ('orange','5C','6A'),
  ('green','6B','6B'), ('blue','6C','6C'), ('red','7A','7A'), ('purple','7B','7B+')
on conflict (wall_color) do nothing;

-- 5.A.3 route_logs — пролазы на тренировке
create table if not exists public.route_logs (
  id         uuid primary key default gen_random_uuid(),
  visit_id   uuid not null references public.visits (id) on delete cascade,
  route_id   uuid not null references public.routes (id) on delete cascade,
  athlete_id uuid not null references public.profiles (id) on delete cascade,
  status     public.route_status not null,
  created_at timestamptz not null default now()
);
create index if not exists route_logs_athlete_idx on public.route_logs (athlete_id);
create index if not exists route_logs_visit_idx   on public.route_logs (visit_id);
create index if not exists route_logs_route_idx   on public.route_logs (route_id);

-- 5.A.4 route_photos — фото «на память» (ОПЦИОНАЛЬНО). Ретеншн PHOTO_RETENTION.
create table if not exists public.route_photos (
  id           uuid primary key default gen_random_uuid(),
  visit_id     uuid not null references public.visits (id) on delete cascade,
  athlete_id   uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  splash_hue   integer,                            -- выбранный оттенок color-splash (опц.)
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '3 months')  -- PHOTO_RETENTION
);
create index if not exists route_photos_expires_idx on public.route_photos (expires_at);
create index if not exists route_photos_athlete_idx on public.route_photos (athlete_id);

-- ---------------------------------------------------------------------------
-- RLS Фазы 2
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on
  public.routes, public.route_logs, public.route_photos to authenticated;
grant select on public.color_grade_map to authenticated;

alter table public.routes         enable row level security;
alter table public.route_logs     enable row level security;
alter table public.route_photos   enable row level security;
alter table public.color_grade_map enable row level security;

-- routes: каталог читают все аутентифицированные; правит тренер/админ
create policy routes_select on public.routes for select using (auth.uid() is not null);
create policy routes_write  on public.routes for all
  using (public.is_coach() or public.is_admin())
  with check (public.is_coach() or public.is_admin());
create policy color_map_select on public.color_grade_map for select using (auth.uid() is not null);

-- route_logs: спортсмен — свои; тренер — через активную связь; admin — все
create policy route_logs_select on public.route_logs for select using (
  public.is_admin() or athlete_id = auth.uid() or public.has_active_link(auth.uid(), athlete_id)
);
create policy route_logs_insert_own on public.route_logs for insert
  with check (athlete_id = auth.uid());
create policy route_logs_modify_own on public.route_logs for update
  using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
create policy route_logs_delete_own on public.route_logs for delete
  using (athlete_id = auth.uid() or public.is_admin());

-- route_photos: владелец — спортсмен; загружает/удаляет только он; тренер видит по связи
create policy route_photos_select on public.route_photos for select using (
  public.is_admin() or athlete_id = auth.uid() or public.has_active_link(auth.uid(), athlete_id)
);
create policy route_photos_insert_own on public.route_photos for insert
  with check (athlete_id = auth.uid());
create policy route_photos_delete_own on public.route_photos for delete
  using (athlete_id = auth.uid() or public.is_admin());

-- ---------------------------------------------------------------------------
-- Авто-удаление просроченных фото (SPEC 4.8.5). SQL удаляет СТРОКИ; удаление
-- ОБЪЕКТОВ в Storage делает Edge Function (pg_net → Storage REST). Планирование —
-- pg_cron (см. MANUAL_ACTIONS.md). Возвращает список путей к удалённым объектам.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired_photos()
returns setof text
language plpgsql security definer set search_path = public as $$
begin
  return query
  delete from public.route_photos
  where expires_at <= now()
  returning storage_path;
end $$;

-- Пример включения по расписанию (раскомментировать после создания Edge Function
-- 'purge-photos', которая зовёт purge_expired_photos() и удаляет объекты Storage):
-- select cron.schedule('purge-expired-photos', '0 3 * * *',
--   $$ select net.http_post(url := '<EDGE_FUNCTION_URL>/purge-photos',
--        headers := jsonb_build_object('Authorization','Bearer <SERVICE_ROLE_JWT>')); $$);

comment on table public.route_photos is
  'SPEC 4.8.5: фото опционально («на память»). Ретеншн PHOTO_RETENTION=3 мес. '
  'Авто-удаление: purge_expired_photos() (строки) + Edge Function (объекты Storage).';
