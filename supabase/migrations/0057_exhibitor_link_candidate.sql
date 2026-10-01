-- ---------------------------------------------------------------------------
-- 0057: 참가사 연결 후보 — "같은 브랜드인가요?"
--
-- 0040(exhibitor · exhibition_participant · booth_participant)은 운영에 적용돼
-- 있었지만 0행이었다. 2026-10-02부터 채운다(설계:
-- docs/superpowers/specs/2026-10-02-cross-exhibition-brand-design.md).
--
-- 인스타 계정·웹 도메인이 겹치면 같은 참가사로 자동 연결한다. **이름만 같으면**
-- 자동으로 합치지 않는다 — 0040 주석의 원칙이고, 이름이 같아도 다른 법인일 수
-- 있다. 그런 쌍을 여기 쌓아 두고 운영자가 대조 검수 화면에서 판단한다.
--
--   booth_id     : 판단 대상 부스(이 부스가 속한 참가사를 합칠지)
--   exhibitor_id : 합칠 대상 참가사
--   status       : pending | approved | rejected | superseded
-- ---------------------------------------------------------------------------

create table if not exists exhibitor_link_candidate (
  id           text primary key,
  booth_id     text not null references booth(id) on delete cascade,
  exhibitor_id text not null references exhibitor(id) on delete cascade,
  reason       text not null,
  status       text not null default 'pending'
               check (status in ('pending', 'approved', 'rejected', 'superseded')),
  reviewed_at  timestamptz,
  reviewed_by  text,
  created_at   timestamptz not null default now(),
  -- 같은 쌍을 두 번 내지 않는다(백필을 다시 돌려도).
  unique (booth_id, exhibitor_id)
);

create index if not exists exhibitor_link_candidate_status_idx
  on exhibitor_link_candidate (status, created_at desc);

alter table exhibitor_link_candidate enable row level security;
-- 운영자 화면만 읽는다. 읽기도 서비스 롤로 한다(정책 없음 = anon 차단).
