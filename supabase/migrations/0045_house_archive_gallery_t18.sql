-- T18(니지) 갤러리 이미지 추가 — 0035 당시 스킵됐던 곳 재수집.
--
-- 0035 작성 시점엔 nijiboku 계정 게시물 4개를 확인했는데 전부 영상/릴스로 보여
-- T18을 통째로 제외했다. 그런데 실제로는 계정이 2500개가 넘는 게시물을 가진
-- 일러스트레이터 계정이고 프로필 그리드에 정적 이미지 게시물이 많았다 — 당시
-- 확인이 불충분했던 것. 이번에 다시 훑어 정적 일러스트 3장을 확보했다.
--
-- 겸사겸사 표지 이미지(booth.image)도 고쳤다 — 기존 T18.webp가 전체 브라우저
-- 화면을 캡처한 스크린샷(사이드 캡션 패널까지 포함)이었던 걸 확인해 원본
-- 이미지만 깨끗하게 다시 크롭했다(0027/0032에서 잘못 들어간 것으로 추정,
-- 이번에 발견).
--
-- 멱등 — 여러 번 돌려도 같은 값이 된다.
update booth
   set images = '["/booths/house-archive/T18-1.webp", "/booths/house-archive/T18-2.webp", "/booths/house-archive/T18-3.webp"]'::jsonb,
       logo_url = '/booths/house-archive/T18.webp'
 where exhibition_id = 'exh_house_archive_2026'
   and code = 'T18';

-- 확인용:
--   select code, logo_url, jsonb_array_length(images) from booth
--    where exhibition_id='exh_house_archive_2026' and code='T18';
--   -- images 3
