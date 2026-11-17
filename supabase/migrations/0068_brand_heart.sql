-- ---------------------------------------------------------------------------
-- 0068: brand_heart — 브랜드 하트를 부스 하트와 따로 저장한다(2026-11-17 Ted 결정).
--
-- 왜: 부스가 아직 없는 참가 브랜드(예: 새해준비상점 251곳)에도 하트를 받아야 한다.
-- 부스 하트(booth_note)에서 계산하면 부스 없는 참가에는 하트를 남길 자리가 없다.
-- 브랜드 하트는 박람회를 넘는다 — exhibitor(브랜드)에 건다. 브랜드 알림의 근거다.
--
-- 기기가 로그인 전에 먼저 남기고, 로그인하면 계정으로 올린다(booth_note와 같은 길).
-- 로그아웃해도 기기 기록은 그대로 둔다. 계정을 지우면 같이 지운다(cascade).
--
-- RLS: 각자 자기 줄만(0041과 같은 owner-scoped). 서버는 웹(쿠키)에선 서비스 롤로,
-- iOS(Bearer)에선 그 토큰으로 접근한다.
-- ---------------------------------------------------------------------------

create table if not exists brand_heart (
  user_id      text not null references app_user(id) on delete cascade,
  exhibitor_id text not null references exhibitor(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (user_id, exhibitor_id)
);

create index if not exists brand_heart_exhibitor_idx on brand_heart (exhibitor_id);

alter table brand_heart enable row level security;

drop policy if exists "own row select brand_heart" on brand_heart;
drop policy if exists "own row insert brand_heart" on brand_heart;
drop policy if exists "own row delete brand_heart" on brand_heart;
create policy "own row select brand_heart" on brand_heart
  for select using (auth.uid()::text = user_id);
create policy "own row insert brand_heart" on brand_heart
  for insert with check (auth.uid()::text = user_id);
create policy "own row delete brand_heart" on brand_heart
  for delete using (auth.uid()::text = user_id);

comment on table brand_heart is
  '브랜드 하트(사용자 × 브랜드). 부스 하트와 따로(2026-11-17). 브랜드 알림은 이 표와 로그인한 기기(push_device.user_id)로만 고른다.';
