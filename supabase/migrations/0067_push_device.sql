-- ---------------------------------------------------------------------------
-- 0067: push_device — APNs 기기 토큰 저장(보내기는 아직 없음).
--
-- 왜(화면 설계서 D 6-1, UI 13): 알림을 보내려면 기기 토큰이 서버에 있어야 한다. 지금
-- POST /api/push/subscribe는 저장하지 않는 자리표시였다.
--
-- 누구 토큰인가(2026-11-17 Ted 결정):
-- - 로그인 안 한 기기도 토큰을 남길 수 있다(user_id null, anon_id만). 여는 날 같은
--   박람회 알림 후보로 쓸 수 있게.
-- - **브랜드 알림은 로그인한 분에게만 보낸다.** 브랜드 알림 대상은 반드시
--   user_id is not null and revoked_at is null 로 고른다. 브랜드 하트(0068)가
--   계정에 있으므로 그 계정의 기기만 대상이다.
-- - 같은 토큰이 다시 오면 한 줄을 고친다(apns_token unique). 로그인 상태가 바뀌면
--   user_id도 그 요청 기준으로 바뀐다.
-- - 계정을 지우면 그 계정 토큰도 같이 지운다(on delete cascade).
--
-- 서버만 읽고 쓴다(서비스 롤). RLS를 켜고 정책을 두지 않아 anon 키로는 못 본다.
-- ---------------------------------------------------------------------------

create table if not exists push_device (
  id            text primary key default gen_random_uuid()::text,
  apns_token    text not null unique,
  platform      text not null default 'ios' check (platform in ('ios')),
  environment   text not null check (environment in ('sandbox', 'production')),
  user_id       text references app_user(id) on delete cascade,
  anon_id       text,
  app_version   text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  revoked_at    timestamptz
);

create index if not exists push_device_user_idx
  on push_device (user_id)
  where user_id is not null and revoked_at is null;

alter table push_device enable row level security;

comment on table push_device is
  'APNs 기기 토큰. 브랜드 알림 대상은 user_id가 있는 행만(2026-11-17 Ted 결정). 토큰이 없어진 기기는 revoked_at.';
