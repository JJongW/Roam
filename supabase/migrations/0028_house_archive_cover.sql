-- HOUSE ARCHIVE 2026 포스터를 전시 히어로로 붙인다.
-- 0027에선 cover_image_url을 null로 넣었다(자료 없음). 공식 포스터를 받아
-- public/house-archive-2026-cover.webp(1289x1733, 178KB)로 변환해 커밋했으므로
-- 운영 DB도 같은 경로를 가리키게 맞춘다. mock 진실은 seed-house-archive.ts:32.
update exhibition
   set cover_image_url = '/house-archive-2026-cover.webp'
 where id = 'exh_house_archive_2026';
