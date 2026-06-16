-- ---------------------------------------------------------------------------
-- 커뮤니티 글 삭제 허용 (본인 글 삭제 기능, NS-5).
-- anon 키 + 영속 정책 패턴은 bookmark 삭제와 동일(using true). 소유권은
-- 앱 레이어에서 session_id 일치로 강제한다(서버 라우트가 cookie 세션으로 검증).
-- ---------------------------------------------------------------------------
drop policy if exists "anon delete community_post" on community_post;
create policy "anon delete community_post" on community_post for delete using (true);
