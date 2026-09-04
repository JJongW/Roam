-- 0036: issue_log — 서버/클라이언트 오류 이벤트. source 컬럼 하나로 서버·클라이언트를
-- 구분한다(둘 다 "언제·어디서·무슨 메시지·스택"이라는 같은 모양의 사건 기록이라 테이블을
-- 나눌 이유가 없다). 쓰기·읽기 모두 service-role로만 접근(POST /api/errors,
-- instrumentation.ts onRequestError, /admin/errors) — anon/authenticated용 정책을
-- 두지 않아 RLS가 그 두 role은 전면 차단한다.

create table if not exists issue_log (
  id          text primary key,
  source      text not null check (source in ('server', 'client')),
  message     text not null,
  stack       text,
  path        text,
  digest      text,
  user_id     text,
  session_id  text,
  context     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists issue_log_created_idx
  on issue_log (created_at desc);
create index if not exists issue_log_source_created_idx
  on issue_log (source, created_at desc);

alter table issue_log enable row level security;
