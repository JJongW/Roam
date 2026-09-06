-- 부스 상세 갤러리에 실제 인스타 상품/작품샷을 채운다(파일럿 8곳).
--
-- 지금까지 booth.images는 로고와 같은 사진 1장짜리 배열이라, 부스 상세의 갤러리
-- 섹션(BoothGallery, booth-detail page.tsx ~100행)이 로고를 한 번 더 보여주는
-- 꼴이었다 — 사용자가 "프로필 사진만 있고 상품 사진이 하나도 없다"고 지적한 지점.
--
-- 해당 브랜드 인스타 최신 게시물(최소 6개)을 훑어 그 브랜드가 스스로 내세우는
-- 이미지(상품·작품·회화 등 형태 무관, 이벤트 공지/타 브랜드 태그 게시물은 제외)
-- 중 최대 3장을 골라 정사각 크롭·480px·webp로 저장했다(공용 템플릿이 아니라
-- 게시물 스크린샷이라 letterbox 트림만 하고 퍼센트 크롭은 안 함).
-- logo_url·description은 그대로 둔다 — 대표 썸네일은 기존 브랜드 카드 이미지 유지.
--
-- 8곳 파일럿 — 결과 보고 전체(H+T+정규 68곳)로 넓힐지 정한다.
--
-- 멱등 — 여러 번 돌려도 같은 값이 된다.
update booth b
   set images = to_jsonb(v.images)
  from (values
  ('H01', array['/booths/house-archive/H01-1.webp', '/booths/house-archive/H01-2.webp', '/booths/house-archive/H01-3.webp']),  -- 빅슬립
  ('H02', array['/booths/house-archive/H02-1.webp', '/booths/house-archive/H02-2.webp', '/booths/house-archive/H02-3.webp']),  -- 헤르시
  ('T01', array['/booths/house-archive/T01-1.webp', '/booths/house-archive/T01-2.webp', '/booths/house-archive/T01-3.webp']),  -- 박스걸스튜디오
  ('T05', array['/booths/house-archive/T05-1.webp', '/booths/house-archive/T05-2.webp', '/booths/house-archive/T05-3.webp']),  -- 시시콜콜한잡화점
  ('T10', array['/booths/house-archive/T10-1.webp', '/booths/house-archive/T10-2.webp', '/booths/house-archive/T10-3.webp']),  -- 소포
  ('C01', array['/booths/house-archive/C01-1.webp', '/booths/house-archive/C01-2.webp', '/booths/house-archive/C01-3.webp']),  -- 루이스폴센
  ('E09', array['/booths/house-archive/E09-1.webp', '/booths/house-archive/E09-2.webp', '/booths/house-archive/E09-3.webp']),  -- 포티(4T)
  ('M01', array['/booths/house-archive/M01-1.webp', '/booths/house-archive/M01-2.webp', '/booths/house-archive/M01-3.webp'])  -- 한국파이롯트
  ) as v(code, images)
 where b.exhibition_id = 'exh_house_archive_2026'
   and b.code = v.code;

-- 확인용:
--   select code, jsonb_array_length(images) from booth
--    where exhibition_id='exh_house_archive_2026' and code in ('H01', 'H02', 'T01', 'T05', 'T10', 'C01', 'E09', 'M01');
--   -- 전부 3
