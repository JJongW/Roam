-- 0019: user_signal_log — L4 사용자 메모리의 원장(append-only).
-- 사용자 행동 신호(부스 방문/skip/북마크/동선저장)를 category slug로 확장해 적재한다.
-- 이 원장을 결정론으로 증류(confidence 수학)해 user_brain을 만든다. 재증류 소스. 멱등.
-- 로그인 필수 전환으로 app_user 귀속 가능(익명 세션 아님).

create table if not exists user_signal_log (
  id            text primary key,
  user_id       text not null references app_user(id) on delete cascade,
  exhibition_id text not null references exhibition(id) on delete cascade,
  kind          text not null,
  booth_code    text,
  slugs         jsonb not null default '[]'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists user_signal_log_user_created_idx
  on user_signal_log (user_id, created_at desc);

alter table user_signal_log enable row level security;

drop policy if exists "public read user_signal_log" on user_signal_log;
create policy "public read user_signal_log" on user_signal_log for select using (true);
drop policy if exists "anon insert user_signal_log" on user_signal_log;
create policy "anon insert user_signal_log" on user_signal_log for insert with check (true);
