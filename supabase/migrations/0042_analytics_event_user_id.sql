-- analytics_event에 user_id를 추가한다.
--
-- 왜: 취향·판단·결과는 user_signal(user_id 기준)에, 클릭·체류·히트맵·동선은
-- analytics_event(session_id 기준)에 쌓여 왔다. 둘을 잇는 키가 없어서
-- "어느 취향의 사람이 어디를 눌렀나"를 계산할 수 없었다.
--
-- 방문객 앱 전체가 로그인 게이트 뒤(src/proxy.ts)이므로 실질적으로 거의 모든
-- 이벤트에 사용자가 있다 — 지금까지 적지 않았을 뿐이다. 과거 행은 소급이
-- 불가능하므로 nullable로 둔다(기존 행 = null = "적기 전에 쌓인 것").
--
-- 운영 적용 최신은 0041이므로 0042를 쓴다.

alter table analytics_event
  add column if not exists user_id text;

comment on column analytics_event.user_id is
  '로그인 사용자(app_user.id). user_signal과 조인해 취향 세그먼트 × 행동을 교차한다. null = 익명이거나 이 컬럼 도입 전에 쌓인 행.';

-- app_user 삭제 시 이벤트를 지우지 않는다 — 집계는 남고 귀속만 끊긴다.
alter table analytics_event
  drop constraint if exists analytics_event_user_id_fkey;
alter table analytics_event
  add constraint analytics_event_user_id_fkey
  foreign key (user_id) references app_user(id) on delete set null;

-- 전시별 사용자 단위 집계(metrics-rollup의 주 질의 형태).
create index if not exists analytics_event_exhibition_user_idx
  on analytics_event (exhibition_id, user_id);

-- 사용자 여정 조회(L3 개체 상세).
create index if not exists analytics_event_user_created_idx
  on analytics_event (user_id, created_at desc)
  where user_id is not null;
