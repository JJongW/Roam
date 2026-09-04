-- ---------------------------------------------------------------------------
-- Roam — 초기 스키마. .claude/plans/erd.md 미러링.
-- 주의: seed id가 비-uuid 문자열('exh_techworld_2026' 등)이므로 PK/FK는 text 사용.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- --- Enums -----------------------------------------------------------------
do $$ begin
  create type visit_purpose as enum ('purchase', 'information', 'networking', 'experience');
exception when duplicate_object then null; end $$;

do $$ begin
  create type movement_preference as enum ('shortest', 'balanced', 'thorough');
exception when duplicate_object then null; end $$;

do $$ begin
  create type companion_type as enum ('alone', 'partner', 'family', 'group', 'business');
exception when duplicate_object then null; end $$;

do $$ begin
  create type route_status as enum ('active', 'completed', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type bookmark_target as enum ('booth', 'event');
exception when duplicate_object then null; end $$;

do $$ begin
  create type analytics_type as enum ('view', 'dwell', 'route_start', 'route_complete', 'booth_arrive', 'event_bookmark');
exception when duplicate_object then null; end $$;

-- --- organizer (Phase 4 auth) ----------------------------------------------
create table if not exists organizer (
  id          text primary key default gen_random_uuid()::text,
  email       text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- --- exhibition ------------------------------------------------------------
create table if not exists exhibition (
  id            text primary key default gen_random_uuid()::text,
  slug          text not null unique,
  name          text not null,
  venue         text not null,
  description   text not null default '',
  start_date    date not null,
  end_date      date not null,
  cover_image_url text,
  map_image_url   text,
  map_width     int not null default 1000,
  map_height    int not null default 700,
  tips          jsonb not null default '{}'::jsonb,
  organizer_id  text references organizer(id) on delete set null,
  created_at    timestamptz not null default now()
);

-- --- hall ------------------------------------------------------------------
create table if not exists hall (
  id            text primary key default gen_random_uuid()::text,
  exhibition_id text not null references exhibition(id) on delete cascade,
  name          text not null,
  floor         int not null default 1,
  sort          int not null default 0
);

-- --- category (also the interest taxonomy) ---------------------------------
create table if not exists category (
  id    text primary key default gen_random_uuid()::text,
  slug  text not null unique,
  name  text not null,
  color text not null,
  icon  text not null
);

-- --- booth -----------------------------------------------------------------
create table if not exists booth (
  id            text primary key default gen_random_uuid()::text,
  exhibition_id text not null references exhibition(id) on delete cascade,
  hall_id       text not null references hall(id) on delete cascade,
  category_id   text not null references category(id) on delete restrict,
  name          text not null,
  company       text not null,
  description   text not null default '',
  long_description text not null default '',
  images        jsonb not null default '[]'::jsonb, -- text[]
  logo_url      text,
  tags          jsonb not null default '[]'::jsonb, -- text[] (category slugs)
  x             numeric not null,
  y             numeric not null,
  popularity    int not null default 50,
  created_at    timestamptz not null default now()
);

-- --- event -----------------------------------------------------------------
create table if not exists event (
  id          text primary key default gen_random_uuid()::text,
  booth_id    text not null references booth(id) on delete cascade,
  title       text not null,
  description text not null default '',
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  reward_info text,
  capacity    int
);

-- --- waiting (1:1 booth) ----------------------------------------------------
create table if not exists waiting (
  booth_id          text primary key references booth(id) on delete cascade,
  enabled           boolean not null default false,
  queue_count       int not null default 0,
  estimated_minutes int not null default 0,
  updated_at        timestamptz not null default now()
);

-- --- welcome_kit (1:1 booth) -----------------------------------------------
create table if not exists welcome_kit (
  booth_id        text primary key references booth(id) on delete cascade,
  enabled         boolean not null default false,
  name            text not null,
  description     text not null default '',
  image_url       text,
  remaining_count int not null default 0
);

-- --- visitor_session (anonymous) -------------------------------------------
create table if not exists visitor_session (
  id            text primary key default gen_random_uuid()::text,
  exhibition_id text not null references exhibition(id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

-- --- review ----------------------------------------------------------------
create table if not exists review (
  id          text primary key default gen_random_uuid()::text,
  booth_id    text not null references booth(id) on delete cascade,
  session_id  text not null, -- 'seed' 등 비-세션 값 허용을 위해 FK 미설정
  rating      int not null check (rating between 1 and 5),
  comment     text not null,
  author_name text not null default '익명',
  created_at  timestamptz not null default now()
);

-- --- user_preference (1:1 session) -----------------------------------------
create table if not exists user_preference (
  session_id          text primary key references visitor_session(id) on delete cascade,
  visit_purpose       visit_purpose not null,
  interests           jsonb not null default '[]'::jsonb, -- text[] (category slugs)
  available_minutes   int not null,
  movement_preference movement_preference not null,
  companion_type      companion_type not null,
  updated_at          timestamptz not null default now()
);

-- --- route_plan ------------------------------------------------------------
create table if not exists route_plan (
  id                text primary key default gen_random_uuid()::text,
  session_id        text not null references visitor_session(id) on delete cascade,
  exhibition_id     text not null references exhibition(id) on delete cascade,
  booth_ids         jsonb not null default '[]'::jsonb, -- ordered text[]
  estimated_minutes int not null default 0,
  legs              jsonb not null default '[]'::jsonb,
  scores            jsonb not null default '{}'::jsonb,
  status            route_status not null default 'active',
  current_booth_id  text,
  visited_booth_ids jsonb not null default '[]'::jsonb, -- text[]
  created_at        timestamptz not null default now()
);

-- --- bookmark --------------------------------------------------------------
create table if not exists bookmark (
  id          text primary key default gen_random_uuid()::text,
  session_id  text not null references visitor_session(id) on delete cascade,
  target_type bookmark_target not null,
  target_id   text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, target_type, target_id)
);

-- --- analytics_event (Phase 4) ---------------------------------------------
create table if not exists analytics_event (
  id            text primary key default gen_random_uuid()::text,
  session_id    text not null references visitor_session(id) on delete cascade,
  exhibition_id text not null references exhibition(id) on delete cascade,
  type          analytics_type not null,
  booth_id      text references booth(id) on delete set null,
  x             numeric,
  y             numeric,
  meta          jsonb,
  created_at    timestamptz not null default now()
);

-- --- Indexes (erd.md) ------------------------------------------------------
create index if not exists idx_booth_exhibition on booth(exhibition_id);
create index if not exists idx_booth_hall on booth(hall_id);
create index if not exists idx_booth_category on booth(category_id);
create index if not exists idx_event_booth_start on event(booth_id, start_time);
create index if not exists idx_review_booth on review(booth_id);
create index if not exists idx_analytics_exhibition_type_created on analytics_event(exhibition_id, type, created_at);
create index if not exists idx_analytics_booth on analytics_event(booth_id);
create index if not exists idx_bookmark_session on bookmark(session_id);

-- ---------------------------------------------------------------------------
-- RLS — 익명 방문자 모델.
-- 방문자 대상 테이블은 anon select 허용(public read).
-- review/bookmark/preference/route/analytics/session은 anon insert 허용.
-- 세션 범위 제한은 anon 키 한계상 애플리케이션 레이어(서버)에서 처리하고,
-- 여기서는 실용적인(pragmatic) 정책만 둔다. organizer/admin 테이블은 쓰기 차단.
-- ---------------------------------------------------------------------------

alter table organizer        enable row level security;
alter table exhibition       enable row level security;
alter table hall             enable row level security;
alter table category         enable row level security;
alter table booth            enable row level security;
alter table event            enable row level security;
alter table waiting          enable row level security;
alter table welcome_kit      enable row level security;
alter table visitor_session  enable row level security;
alter table review           enable row level security;
alter table user_preference  enable row level security;
alter table route_plan       enable row level security;
alter table bookmark         enable row level security;
alter table analytics_event  enable row level security;

-- --- public read: 방문자 대상 테이블 --------------------------------------
create policy "public read exhibition"  on exhibition  for select using (true);
create policy "public read hall"         on hall        for select using (true);
create policy "public read category"     on category    for select using (true);
create policy "public read booth"        on booth       for select using (true);
create policy "public read event"        on event       for select using (true);
create policy "public read waiting"      on waiting     for select using (true);
create policy "public read welcome_kit"  on welcome_kit for select using (true);
create policy "public read review"       on review      for select using (true);

-- --- session-scoped: 익명이 자신의 세션 데이터를 생성/조회 -----------------
-- 세션 자체는 누구나 생성/조회 가능(쿠키로 식별).
create policy "anon insert session" on visitor_session for insert with check (true);
create policy "anon read session"   on visitor_session for select using (true);
create policy "anon update session" on visitor_session for update using (true) with check (true);

-- review: 누구나 작성/조회. (세션 소유 검증은 서버 레이어에서)
create policy "anon insert review" on review for insert with check (true);

-- bookmark: 본인 세션 데이터 생성/조회/삭제. anon 키에서는 단순 허용 후 서버에서 범위 제한.
create policy "anon select bookmark" on bookmark for select using (true);
create policy "anon insert bookmark" on bookmark for insert with check (true);
create policy "anon delete bookmark" on bookmark for delete using (true);

-- user_preference: upsert(insert/update) + select 허용.
create policy "anon select preference" on user_preference for select using (true);
create policy "anon insert preference" on user_preference for insert with check (true);
create policy "anon update preference" on user_preference for update using (true) with check (true);

-- route_plan: 생성/조회/수정 허용(서버에서 세션 범위 처리).
create policy "anon select route" on route_plan for select using (true);
create policy "anon insert route" on route_plan for insert with check (true);
create policy "anon update route" on route_plan for update using (true) with check (true);

-- analytics_event: 익명 기록만 허용. 파생 분석의 public read는 비활성(아래에 select 정책 없음).
create policy "anon insert analytics" on analytics_event for insert with check (true);

-- --- admin 테이블: organizer는 public read/write 모두 차단 -------------------
-- (정책을 만들지 않으면 RLS 활성 상태에서 anon 접근이 전부 거부됨.)
-- 운영자 콘솔은 service_role 키(서버 전용)로 RLS를 우회해 접근한다.
-- exhibition/booth/event 등 admin write 역시 service_role 키로 수행 가정.
