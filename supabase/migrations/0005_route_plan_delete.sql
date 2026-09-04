-- ---------------------------------------------------------------------------
-- 동선 삭제 허용 (내 동선 저장/불러오기/삭제, NS-6).
-- route_plan 은 select/insert/update 정책만 있었다(0001). 삭제 정책이 없어
-- anon 키의 delete 가 RLS 에 막혀 0행 처리되던 문제를 푼다.
-- anon 키 + 영속 정책 패턴은 community_post 삭제(0004)와 동일(using true).
-- 소유권은 앱 레이어에서 강제한다: 서버가 cookie 세션(또는 userId)으로
-- route_plan.session_id / user_id 일치를 확인한 뒤에만 삭제를 실행한다.
-- ---------------------------------------------------------------------------
drop policy if exists "anon delete route" on route_plan;
create policy "anon delete route" on route_plan for delete using (true);
