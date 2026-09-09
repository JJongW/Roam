-- 0056: 리뷰·커뮤니티 포스트 소유자를 익명 세션 → 계정으로 전환
--
-- 2026-07-27 감사 P1-2의 마지막 잔여 항목. 북마크는 0025로 이미 옮겼지만 리뷰와
-- 커뮤니티 포스트는 session_id 기준으로 남아 있어 계정에 안 묶였다. 로그인 필수
-- 전환 이후 "누가 쓴 글인가"는 계정 단위여야 한다.
--
-- 0025(북마크)는 테이블이 0행이라 데이터 이전이 필요 없었다. 여기는 행이 있고,
-- visitor_session에 app_user로 가는 컬럼이 없어서 기계적 매핑이 불가능하다.
-- 규모가 작아(리뷰 3 · 포스트 6) author_name ↔ app_user.nickname 수동 대조로
-- 판정했다(2026-09-10 운영 실측):
--   - review 3행       : 전부 session_id='seed' → 매핑 대상 없음
--   - community_post   : seed 3행 + "테드" 1행(계정 없음) → 제거
--                        "신종원" 2행 → app_user user_yucj9deym (가입 2026-07-23,
--                        작성 2026-08-13이라 동일인으로 확정) → 보존
--
-- 삭제 전 data/_backup/2026-09-10_p1-2-ownership/ 에 전 행을 떠 뒀다(gitignore).
--
-- 삭제 조건을 세션 id 하드코딩이 아니라 "app_user에 없는 소유자"로 쓴 이유:
-- 이 파일을 적용하기까지 새 익명 행이 더 들어와도 같은 규칙이 그대로 먹는다.

-- --- community_post ---------------------------------------------------------
-- FK를 먼저 떼야 세션 id 자리에 user id를 넣을 수 있다.
alter table public.community_post
  drop constraint if exists community_post_session_id_fkey;

-- 매핑이 확정된 행 먼저 옮긴다.
update public.community_post
   set session_id = 'user_yucj9deym'
 where session_id = 'sess_j1ymw7z';

-- 남은 익명 행은 소유자를 확정할 수 없다. community_report는 post_id에
-- on delete cascade라 같이 정리된다.
delete from public.community_post p
 where not exists (
   select 1 from public.app_user u where u.id = p.session_id
 );

alter table public.community_post
  rename column session_id to user_id;

alter table public.community_post
  add constraint community_post_user_id_fkey
  foreign key (user_id) references public.app_user(id) on delete cascade;

-- --- review -----------------------------------------------------------------
-- review.session_id는 애초에 FK가 없었다('seed' 등 비-세션 값 허용 목적).
delete from public.review r
 where not exists (
   select 1 from public.app_user u where u.id = r.session_id
 );

alter table public.review
  rename column session_id to user_id;

alter table public.review
  add constraint review_user_id_fkey
  foreign key (user_id) references public.app_user(id) on delete cascade;

-- 조회 패턴(내 글 모아보기 / 소유 판정)에 쓰는 인덱스.
create index if not exists community_post_user_idx on public.community_post (user_id);
create index if not exists review_user_idx on public.review (user_id);
