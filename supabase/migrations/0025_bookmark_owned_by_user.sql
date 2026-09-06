-- 0025: 북마크 소유자를 익명 세션 → 계정으로 전환
--
-- 로그인 필수 전환 때 /api/bookmarks는 user.id를 넘기도록 바뀌었지만 스키마는
-- session_id → visitor_session FK로 남아 있었다. 모든 insert가 FK 위반(23503)으로
-- 실패했고 에러를 버리는 코드 탓에 201로 위장돼 **북마크가 전량 유실**되고 있었다
-- (2026-07-27 감사 P0-1). booth_note가 이미 쓰는 방식(user_id → app_user)에 맞춘다.
--
-- bookmark 테이블은 0행이라 데이터 이전이 필요 없다.

alter table public.bookmark
  drop constraint if exists bookmark_session_id_fkey;

alter table public.bookmark
  rename column session_id to user_id;

alter table public.bookmark
  add constraint bookmark_user_id_fkey
  foreign key (user_id) references public.app_user(id) on delete cascade;

-- 같은 대상을 두 번 담지 못하게(코드의 addBookmark 선조회와 동일 의미).
create unique index if not exists bookmark_user_target_uniq
  on public.bookmark (user_id, target_type, target_id);
