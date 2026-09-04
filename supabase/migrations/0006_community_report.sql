-- ---------------------------------------------------------------------------
-- 0006: 커뮤니티 글 신고 (NS-5).
-- 신고는 신고자 세션당 1회로 중복 제거(unique). 서로 다른 세션의 신고가
-- REPORT_HIDE_THRESHOLD(앱 상수, 기본 3) 이상 쌓이면 목록에서 숨긴다(앱 레이어).
-- anon 키 + 영속 정책 패턴은 다른 테이블과 동일(using/with check true). 소유권/
-- 임계 판단은 모두 앱 레이어에서 처리한다.
-- ---------------------------------------------------------------------------
create table if not exists community_report (
  id          text primary key default gen_random_uuid()::text,
  post_id     text not null references community_post(id) on delete cascade,
  session_id  text not null references visitor_session(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (post_id, session_id)
);

create index if not exists community_report_post_idx
  on community_report (post_id);

alter table community_report enable row level security;
drop policy if exists "public read community_report" on community_report;
drop policy if exists "anon insert community_report" on community_report;
create policy "public read community_report" on community_report for select using (true);
create policy "anon insert community_report" on community_report for insert with check (true);
