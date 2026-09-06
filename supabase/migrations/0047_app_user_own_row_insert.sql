-- ---------------------------------------------------------------------------
-- 0047: app_user에 own-row insert 정책을 추가한다.
--
-- 웹/닉네임/Google 계정 생성·조회는 전부 서버(service-role, RLS 미적용)를 거친다.
-- iOS Apple 로그인만 예외 — Supabase Auth로 직접 로그인한 뒤 서버를 거치지 않고
-- 자기 자신의 app_user 행을 직접 만든다. 0041이 anon insert를 걷어내면서 이
-- 경로가 막혔다. auth.uid() = id로 소유권이 자명하므로 with check 하나면 충분.
--
-- 0041에 끼워 넣지 않고 새 번호로 뺀 이유: 0041은 이미 운영에 적용됐고, 그
-- 파일은 자기가 만드는 정책을 drop하지 않아 재실행이 42710으로 실패한다.
-- 적용된 마이그레이션은 고치지 않고 뒤에 덧붙인다.
--
-- 2026-09-05 "iOS 직접 연결" 결정 후속.

drop policy if exists "own row insert app_user" on app_user;
create policy "own row insert app_user" on app_user
  for insert with check (auth.uid()::text = id);
