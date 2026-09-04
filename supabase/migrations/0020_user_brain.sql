-- 0020: user_brain — L4 사용자 종단 모델(증류본, per-user 1행).
-- user_signal_log를 증류한 결과(관심·안목·목표·이력)를 jsonb로 보관한다.
-- 원장 아님 — 재증류로 언제든 재생성 가능. LLM 주입 시 요약해 전달. 멱등.

create table if not exists user_brain (
  user_id    text primary key references app_user(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table user_brain enable row level security;

drop policy if exists "public read user_brain" on user_brain;
create policy "public read user_brain" on user_brain for select using (true);
drop policy if exists "anon upsert user_brain" on user_brain;
create policy "anon upsert user_brain" on user_brain for insert with check (true);
drop policy if exists "anon update user_brain" on user_brain;
create policy "anon update user_brain" on user_brain for update using (true) with check (true);
