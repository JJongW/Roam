-- ---------------------------------------------------------------------------
-- 0041: 로그인 계정 데이터 owner-scoped RLS
--
-- 지금까지 app_user/booth_note/user_signal_log/user_brain은 전부 anon 키에
-- using(true)로 열려 있었다(소유권 검사는 서버 쿠키 세션에서만 했다는 게 0003의
-- 원래 설계 의도). 문제는 NEXT_PUBLIC_SUPABASE_ANON_KEY가 이미 웹 브라우저 번들에
-- 박혀 배포되고 있어서(src/lib/supabase/client.ts, Google 로그인/realtime용) 그
-- anon 키만 뽑으면 서버를 거치지 않고 REST로 모든 사용자의 닉네임/이메일/부스
-- 메모/행동 로그를 그대로 읽을 수 있었다 — 이론이 아니라 지금 프로덕션에서 실제로
-- 되는 상태였다(직접 curl로 확인함).
--
-- route_plan/bookmark는 여기서 안 건드린다 — 그 둘은 app_user가 아니라
-- visitor_session(익명 세션) 소유 구조라 auth.uid() 매핑 대상 자체가 아니다.
--
-- 이 정책이 동작하려면 클라이언트가 Supabase Auth가 아니라 우리 서버가 발급한
-- 커스텀 JWT(sub=app_user.id, role=authenticated)를 Authorization 헤더로 보내야
-- 한다 — src/lib/auth/supabase-jwt.ts, api/auth/apple/native/route.ts 변경 참고.
-- Apple identityToken 검증은 그대로 서버(jose + Apple JWKS)에서 하고, 그 결과로
-- 얻은 app_user.id를 다시 우리 서버가 서명한 별도 JWT에 실어 보낼 뿐이라
-- Supabase Auth 자체(auth.users, 소셜 프로바이더 대시보드 설정)는 손대지 않는다.
-- ---------------------------------------------------------------------------

-- --- app_user ----------------------------------------------------------------
-- 계정 생성/조회는 전부 서버(service-role, RLS 미적용)를 거친다 — 지금 이 anon/
-- authenticated 정책이 없어도 앱 로그인·닉네임 조회 기능은 그대로 동작한다
-- (repository.ts가 항상 SUPABASE_SERVICE_ROLE_KEY로 접근함, grep으로 확인).
drop policy if exists "public read app_user" on app_user;
drop policy if exists "anon insert app_user" on app_user;
create policy "own row select app_user" on app_user
  for select using (auth.uid()::text = id);

-- --- booth_note ----------------------------------------------------------------
drop policy if exists "anon select booth_note" on booth_note;
drop policy if exists "anon insert booth_note" on booth_note;
drop policy if exists "anon update booth_note" on booth_note;
drop policy if exists "anon delete booth_note" on booth_note;
create policy "own row select booth_note" on booth_note
  for select using (auth.uid()::text = user_id);
create policy "own row insert booth_note" on booth_note
  for insert with check (auth.uid()::text = user_id);
create policy "own row update booth_note" on booth_note
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "own row delete booth_note" on booth_note
  for delete using (auth.uid()::text = user_id);

-- --- user_signal_log (append-only 원장, update/delete 정책 없음 — 기존 그대로) ---
drop policy if exists "public read user_signal_log" on user_signal_log;
drop policy if exists "anon insert user_signal_log" on user_signal_log;
create policy "own row select user_signal_log" on user_signal_log
  for select using (auth.uid()::text = user_id);
create policy "own row insert user_signal_log" on user_signal_log
  for insert with check (auth.uid()::text = user_id);

-- --- user_brain ----------------------------------------------------------------
drop policy if exists "public read user_brain" on user_brain;
drop policy if exists "anon upsert user_brain" on user_brain;
drop policy if exists "anon update user_brain" on user_brain;
create policy "own row select user_brain" on user_brain
  for select using (auth.uid()::text = user_id);
create policy "own row insert user_brain" on user_brain
  for insert with check (auth.uid()::text = user_id);
create policy "own row update user_brain" on user_brain
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

-- --- user_exhibitor_judgment_history: SECURITY DEFINER 뷰 우회 차단 ------------
-- 0040이 만든 이 뷰는 owner(postgres) 권한으로 실행돼 RLS를 무시한다 — 위에서
-- booth_note에 건 owner-scoped 정책이 이 뷰를 거치면 그대로 우회돼 전체 유저의
-- 판단 데이터가 다시 다 보인다. 0040 주석대로 이 뷰는 로미(서버)와 운영 도구
-- 전용이라 클라이언트 접근이 필요 없다 — service_role은 grant와 무관하게 항상
-- 접근되므로 REVOKE해도 그쪽 동작엔 영향 없다.
revoke all on public.user_exhibitor_judgment_history from anon, authenticated;
