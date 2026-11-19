-- ---------------------------------------------------------------------------
-- 0071: 브랜드 알림 서버 — notification_log, notification_pref, notification_job_cursor
--
-- 결정 기록: docs/decisions/2026-11-19_브랜드-알림-서버.md
-- 2026-11-19 Ted: "브랜드 알림 서버부터 해." UI 18 1-A(홈 위 종에서 들어가는 앱 안 알림함).
--
-- [1] notification_log — 알림 한 줄 = (사용자, 브랜드, 박람회) 하나.
--   - dedupe_key 'brand_appear:<user>:<exhibitor>:<exhibition>' unique. 같은 사용자에게 같은 브랜드,
--     같은 박람회를 두 번 알리지 않는다. 잡이 두 번 돌아도 insert가 충돌로 빠진다.
--   - 푸시는 하루에 한 번으로 묶는다. 같이 나간 줄은 batch_id가 같다(하나면 그 브랜드, 여럿이면 목록).
--   - 기기가 없거나 푸시가 안 나가도 줄은 남긴다(status no_device). 알림함이 이 표를 읽는다.
--   - status: queued(조용한 시간이거나 아직 안 보냄) | sent | failed | no_device | muted | expired(보내기 전에 박람회가 끝남)
--   - muted: 브랜드 알림을 끈 사람. 푸시는 없고 알림함엔 보인다(2026-11-19 Ted, UI 18 질문 6).
--   - 알림함은 queued를 보여 주지 않는다. 푸시와 알림함이 같은 순간에 생기게.
--
-- [2] notification_pref — 서버가 아는 알림 끄기. 줄이 없으면 켜짐. 끄면 푸시만 멈추고 알림함 줄은 계속 생긴다.
--   iOS PushToggleRow(brand_appear)는 지금 기기(UserDefaults)에만 저장한다. 서버로 올리는 건
--   Roam-ios 따로 작업(PUT /api/me/notification-prefs). 그 전까지는 아무도 꺼진 상태가 아니다.
--
-- [3] notification_job_cursor — "지난번 돌린 뒤 새로 생긴 참가"의 기준 시각. 드라이런은 옮기지 않는다.
--
-- RLS: 세 표 다 켜고 정책을 두지 않는다(서비스 롤 전용, 0067 push_device와 같음).
-- 알림함 API(/api/me/notifications)가 로그인 확인 뒤 서비스 롤로 그 사람 줄만 읽고 고친다.
--
-- 적용은 손으로 한다(Supabase SQL Editor). 새 표만 만들어 기존 데이터는 바꾸지 않는다.
-- ---------------------------------------------------------------------------

create table if not exists notification_log (
  id            text primary key default gen_random_uuid()::text,
  user_id       text not null references app_user(id) on delete cascade,
  kind          text not null check (kind in ('brand_appear')),
  title         text not null check (length(title) between 1 and 120),
  body          text not null check (length(body) between 1 and 400),
  payload       jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  dedupe_key    text not null unique,
  batch_id      text,
  status        text not null default 'queued'
                check (status in ('queued', 'sent', 'failed', 'no_device', 'muted', 'expired')),
  error         text,
  created_at    timestamptz not null default now(),
  sent_at       timestamptz,
  read_at       timestamptz
);

-- 알림함: 내 줄 최신순.
create index if not exists notification_log_user_created_idx
  on notification_log (user_id, created_at desc);
-- 보내기: 아직 안 나간 줄.
create index if not exists notification_log_queued_idx
  on notification_log (kind, created_at) where status = 'queued';
-- 하루 한 번: 오늘 이미 보낸 사람.
create index if not exists notification_log_sent_idx
  on notification_log (kind, sent_at) where status = 'sent';

alter table notification_log enable row level security;

comment on table notification_log is
  '알림 한 줄 = (사용자, 브랜드, 박람회). 푸시는 batch_id로 하루 한 번 묶는다. 기기가 없어도 남겨 알림함이 읽는다(2026-11-19).';

create table if not exists notification_pref (
  user_id     text not null references app_user(id) on delete cascade,
  kind        text not null check (kind in ('brand_appear')),
  enabled     boolean not null,
  updated_at  timestamptz not null default now(),
  primary key (user_id, kind)
);

alter table notification_pref enable row level security;

comment on table notification_pref is
  '알림 켜고 끄기. 줄이 없으면 켜짐. iOS 설정 토글이 PUT /api/me/notification-prefs로 올린다(iOS 연결은 따로).';

create table if not exists notification_job_cursor (
  job          text primary key,
  last_run_at  timestamptz not null
);

alter table notification_job_cursor enable row level security;

comment on table notification_job_cursor is
  '알림 잡이 마지막으로 본 시각. brand_appear는 이 시각 뒤에 생긴 참가만 본다.';

-- ---------------------------------------------------------------------------
-- [4] 계정 병합(link_app_user_by_email)이 notification_log, notification_pref도 옮긴다.
-- 0069 본문 그대로에 두 표를 옮기는 줄만 더한다(이 파일이 함수의 최신 정의가 된다).
-- 안 옮기면 아래 옛 행 삭제의 cascade로 알림함과 "끔" 설정이 사라진다 — 끈 사람이 다시 받게 된다.
-- notification_pref는 (user_id, kind) PK라 새 계정에 이미 있는 kind는 새 쪽을 남긴다.
-- notification_log의 dedupe_key는 옛 계정 id를 품은 채 둔다(키끼리 겹치지 않는다). 잡은 지난번
-- 뒤에 생긴 참가만 보므로, 병합 전에 이미 알린 (브랜드, 박람회)가 새 계정 키로 다시 잡히지 않는다.
-- ---------------------------------------------------------------------------

create or replace function link_app_user_by_email(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  old_id text;
  old_nickname text;
  old_avatar_url text;
  new_id text := auth.uid()::text;
  my_email text;
begin
  if new_id is null then
    return null;
  end if;

  -- 신원의 출처는 세션이지 인자가 아니다. 미확인 이메일은 대상에서 제외한다.
  select email into my_email
  from auth.users
  where id = auth.uid() and email_confirmed_at is not null;

  if my_email is null then
    return null;
  end if;

  if p_email is not null and lower(p_email) <> lower(my_email) then
    return null;
  end if;

  select id, nickname, avatar_url into old_id, old_nickname, old_avatar_url
  from app_user
  where lower(email) = lower(my_email) and id <> new_id
  order by created_at asc
  limit 1;

  if old_id is null then
    return null;
  end if;

  -- app_user(id)를 FK로 가진 테이블.
  update booth_note set user_id = new_id where user_id = old_id;
  update user_signal_log set user_id = new_id where user_id = old_id;
  update route_plan set user_id = new_id where user_id = old_id;
  update analytics_event set user_id = new_id where user_id = old_id;
  -- FK 없는 plain text 참조 — DB가 안 봐주므로 직접 옮긴다(0048).
  update issue_log set user_id = new_id where user_id = old_id;
  -- 새 계정 쪽 행을 먼저 비운다 — user_brain은 PK, bookmark는
  -- (user_id, target_type, target_id) 유니크라 그대로 옮기면 충돌한다.
  delete from user_brain where user_id = new_id;
  update user_brain set user_id = new_id where user_id = old_id;
  delete from bookmark where user_id = new_id;
  update bookmark set user_id = new_id where user_id = old_id;
  -- 0067, 0068(2026-11-17). 둘 다 app_user cascade라 옮기지 않으면 아래 옛 행 삭제와
  -- 함께 사라진다. brand_heart는 (user_id, exhibitor_id) PK라 겹치는 줄은 새 쪽을 남긴다.
  delete from brand_heart
   where user_id = old_id
     and exhibitor_id in (select exhibitor_id from brand_heart where user_id = new_id);
  update brand_heart set user_id = new_id where user_id = old_id;
  update push_device set user_id = new_id where user_id = old_id;
  -- 0071(2026-11-19).
  delete from notification_pref
   where user_id = old_id
     and kind in (select kind from notification_pref where user_id = new_id);
  update notification_pref set user_id = new_id where user_id = old_id;
  update notification_log set user_id = new_id where user_id = old_id;

  -- 옛 행을 먼저 지운다 — nickname은 lower(nickname) 유니크(0003)라, 옛 행이
  -- 그 닉네임을 쥔 채로 새 행에 같은 값을 쓰면 23505로 반드시 실패한다.
  delete from app_user where id = old_id;

  update app_user
    set nickname = old_nickname,
        avatar_url = coalesce(old_avatar_url, avatar_url)
    where id = new_id;

  return old_id;
end;
$$;

revoke all on function link_app_user_by_email(text) from public;
grant execute on function link_app_user_by_email(text) to authenticated;
