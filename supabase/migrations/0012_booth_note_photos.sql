-- booth_note: 개인 메모에 사진(클라우디너리 URL) 첨부 지원.
-- 표시용 미디어이므로 URL 배열만 보관(바이트는 Cloudinary). 기본 빈 배열.
alter table booth_note
  add column if not exists photos jsonb not null default '[]'::jsonb;
