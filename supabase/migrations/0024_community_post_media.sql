-- 0024: community_post 미디어 컬럼 복구
--
-- 커뮤니티 미디어 첨부(2026-06-20 cloudinary-media-foundation / community-media-attach)가
-- 코드에만 들어가고 DB에는 반영된 적이 없다. repository.createPost가 media_* 3개를 넣는데
-- 컬럼이 없어 insert가 PGRST204로 실패했고, 에러를 버리는 코드 탓에 201로 위장돼
-- **커뮤니티 글쓰기가 전량 유실**되고 있었다(2026-07-27 감사 P0-2).
--
-- 순수 추가라 기존 4행에 영향 없음.

alter table public.community_post
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_public_id text;

-- 이미지/영상 외 값이 들어오지 않게 막는다(코드의 z.enum(["image","video"])와 일치).
alter table public.community_post
  drop constraint if exists community_post_media_type_check;
alter table public.community_post
  add constraint community_post_media_type_check
  check (media_type is null or media_type in ('image', 'video'));
