-- ---------------------------------------------------------------------------
-- 0003: nickname accounts, signed-in booth notes, route sharing
-- ---------------------------------------------------------------------------

-- --- app_user (nickname is the unique public key) --------------------------
create table if not exists app_user (
  id         text primary key default gen_random_uuid()::text,
  nickname   text not null,
  created_at timestamptz not null default now()
);
-- case-insensitive uniqueness on nickname
create unique index if not exists app_user_nickname_unique
  on app_user (lower(nickname));

-- --- booth_note (per-user visited / skip / memo) ---------------------------
create table if not exists booth_note (
  user_id    text not null references app_user(id) on delete cascade,
  booth_id   text not null references booth(id) on delete cascade,
  status     text check (status in ('visited', 'skipped')),
  memo       text,
  updated_at timestamptz not null default now(),
  primary key (user_id, booth_id)
);

-- --- route_plan: ownership + sharing ---------------------------------------
alter table route_plan add column if not exists user_id   text references app_user(id) on delete set null;
alter table route_plan add column if not exists title     text;
alter table route_plan add column if not exists is_public boolean not null default false;
alter table route_plan add column if not exists share_id  text;
create unique index if not exists route_plan_share_id_unique
  on route_plan (share_id) where share_id is not null;
create index if not exists route_plan_public_idx
  on route_plan (exhibition_id, created_at desc) where is_public;

-- --- RLS --------------------------------------------------------------------
alter table app_user   enable row level security;
alter table booth_note enable row level security;

-- app_user: 닉네임 중복 확인/조회 위해 public read. 생성은 서버(또는 anon) 허용.
drop policy if exists "public read app_user" on app_user;
drop policy if exists "anon insert app_user" on app_user;
create policy "public read app_user"  on app_user   for select using (true);
create policy "anon insert app_user"  on app_user   for insert with check (true);

-- booth_note: 소유 범위는 서버 레이어에서 user 쿠키로 처리. anon 키는 단순 허용.
drop policy if exists "anon select booth_note" on booth_note;
drop policy if exists "anon insert booth_note" on booth_note;
drop policy if exists "anon update booth_note" on booth_note;
drop policy if exists "anon delete booth_note" on booth_note;
create policy "anon select booth_note" on booth_note for select using (true);
create policy "anon insert booth_note" on booth_note for insert with check (true);
create policy "anon update booth_note" on booth_note for update using (true) with check (true);
create policy "anon delete booth_note" on booth_note for delete using (true);

-- route_plan: 공개 동선 갤러리/링크 열람을 위해 public read 추가.
-- (기존 0001은 anon select route 정책이 이미 있어 사실상 열람 가능)
