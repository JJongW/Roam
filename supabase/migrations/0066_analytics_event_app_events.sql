-- ---------------------------------------------------------------------------
-- 0066: analytics_event를 넓혀 iOS(와 앞으로 Android) 이름 붙은 이벤트를 같은 곳에 받는다.
--
-- 왜(화면 설계서 E 2-2, README 헤더 기본값 5):
-- - 홈, 온보딩, 설정, 알림 반응은 박람회가 없다 → exhibition_id를 비울 수 있게.
-- - visitor_session도 박람회가 필수라 앱 세션을 거기 못 만든다 → session_id도 비울 수
--   있게 하고, 앱이 만든 세션 id는 app_session_id에 따로 둔다(FK 없음).
-- - enum을 늘릴 때마다 마이그레이션하지 않도록 새 이벤트는 type = 'app' + name으로 받는다.
--   웹이 쓰는 옛 7종(view, ui_click 등)과 운영 콘솔 화면은 그대로다.
-- - 기기는 끊긴 동안 모았다가 묶어 보낸다 → client_ts(순서), event_id(중복 제거, unique).
--
-- 개인정보(설계서 E 2-1): 위치, 메모, 회고 글, 묻는 말 원문은 넣지 않는다. 서버
-- (lib/analytics/app-events.ts)가 속성에서 그런 키를 지우고 긴 글을 자른다.
--
-- 기존 행은 그대로다(새 칸은 null). 기존 쓰기 경로도 그대로 돈다.
--
-- ⚠️ 'app' enum 값 추가(alter type ... add value)는 같은 트랜잭션 안에서 그 값을 쓰지
-- 못한다. 이 파일은 그 값을 쓰지 않으니 SQL Editor에서 한 번에 돌려도 된다.
-- ---------------------------------------------------------------------------

alter type analytics_type add value if not exists 'app';

alter table analytics_event
  alter column exhibition_id drop not null,
  alter column session_id drop not null;

alter table analytics_event
  add column if not exists name           text,
  add column if not exists platform       text,
  add column if not exists app_version    text,
  add column if not exists anon_id        text,
  add column if not exists app_session_id text,
  add column if not exists screen_id      text,
  add column if not exists client_ts      timestamptz,
  add column if not exists event_id       text;

alter table analytics_event
  drop constraint if exists analytics_event_platform_check;
alter table analytics_event
  add constraint analytics_event_platform_check
  check (platform is null or platform in ('web', 'ios', 'android'));

-- 중복 제거 열쇠. null은 서로 다르게 취급되므로 옛 행(null)과 충돌하지 않는다.
-- 부분 인덱스가 아니라 제약으로 둔다 — PostgREST upsert(on_conflict=event_id)가 쓴다.
alter table analytics_event
  drop constraint if exists analytics_event_event_id_key;
alter table analytics_event
  add constraint analytics_event_event_id_key unique (event_id);

-- 'app' 이벤트에 이름이 꼭 있게 하는 제약은 걸지 않는다 — 새 enum 값을 같은 트랜잭션에서
-- 쓰면 실패한다. 이름은 서버 입력 검사(lib/schemas)가 막는다.

create index if not exists analytics_event_name_created_idx
  on analytics_event (name, created_at desc)
  where name is not null;
create index if not exists analytics_event_platform_created_idx
  on analytics_event (platform, created_at desc)
  where platform is not null;
create index if not exists analytics_event_anon_created_idx
  on analytics_event (anon_id, created_at desc)
  where anon_id is not null;

comment on column analytics_event.name is
  '이벤트 이름(type = app일 때). 목록은 화면 설계서 E 2-4. 예 heart_add, visit_mark.';
comment on column analytics_event.anon_id is
  '설치 단위 무작위 id. 광고 식별자(IDFA) 아님. 로그인하면 같은 행의 user_id로 잇는다.';
comment on column analytics_event.app_session_id is
  '앱이 만든 세션 id. visitor_session(웹 익명 세션, 박람회 필수)과 별개라 FK가 없다.';
comment on column analytics_event.screen_id is
  'Figma UI v1 화면 id(예 "UI 3-01").';
