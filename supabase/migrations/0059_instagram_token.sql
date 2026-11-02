-- ---------------------------------------------------------------------------
-- 0059: 인스타 장기 토큰 저장소(갱신본)
--
-- 인스타 장기 토큰은 60일 뒤 만료된다. Vercel cron(/api/cron/ig-token-refresh)이
-- 7일마다 갱신하는데, Vercel 환경변수는 코드가 고칠 수 없어서 갱신본을 여기 둔다.
-- 웹훅·게시 CLI는 이 행 > env(IG_ACCESS_TOKEN) 순으로 쓴다(src/lib/instagram/token.ts).
--
-- 한 줄짜리 표다(id = 1 고정). 토큰을 새로 발급받아 env를 바꿨으면 이 행을 지운다:
--   delete from ig_token;
--
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약.
-- ---------------------------------------------------------------------------

create table if not exists ig_token (
  id           int primary key default 1 check (id = 1),
  access_token text not null,
  expires_at   timestamptz,
  refreshed_at timestamptz not null default now()
);

alter table ig_token enable row level security;
-- 서비스 롤 전용. 정책이 없으니 방문객 키(anon)로는 읽을 수 없다 — 토큰이라 특히.
