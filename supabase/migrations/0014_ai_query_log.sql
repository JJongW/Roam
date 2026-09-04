-- 0014: ai_query_log — 지도 "AI 추천" 채팅창 입력 로그.
-- 누적해서 자주 나오는 키워드를 추적(RAG)하고, 추천 프롬프트에 트렌딩 신호로 주입한다.
-- 익명 세션이 쓰므로 anon insert 허용, 집계 읽기는 public read. 멱등.

create table if not exists ai_query_log (
  id            text primary key,
  exhibition_id text not null references exhibition(id) on delete cascade,
  session_id    text not null,
  text          text not null,
  keywords      jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists ai_query_log_exhibition_created_idx
  on ai_query_log (exhibition_id, created_at desc);

alter table ai_query_log enable row level security;

drop policy if exists "public read ai_query_log" on ai_query_log;
create policy "public read ai_query_log" on ai_query_log for select using (true);
drop policy if exists "anon insert ai_query_log" on ai_query_log;
create policy "anon insert ai_query_log" on ai_query_log for insert with check (true);
