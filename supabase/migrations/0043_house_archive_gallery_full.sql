-- 하우스 아카이브 갤러리 이미지 전체 확장 (파일럿 8곳 → 나머지 88곳, 0034 후속).
--
-- 0034에서 파일럿 8곳(C01·E09·H01·H02·M01·T01·T05·T10)에 실제 인스타 상품/작품샷을
-- booth.images에 채웠다. 이번엔 C·E·G·H·M·R·T 전 존을 훑어 나머지 88곳(총 96곳)을
-- 같은 방식으로 채운다. G05·T18·T19는 정적 이미지를 구할 수 없어(비공개/영상 게시물뿐)
-- 제외 — 표지 이미지(booth.image)만 유지한다.
--
-- 이미지는 각 브랜드 인스타 게시물 스크린샷을 letterbox 트림 → 정중앙 정사각 크롭 →
-- 480px webp(q=78)로 처리했다(scripts/process-house-archive-gallery-images.py).
-- 부스당 최대 3장 — 계정 사정(게시물 수·품질)에 따라 1~2장만 확보된 곳도 있다
-- (억지로 3장 채우지 않음). 88곳 중 3장 2곳·2장 67곳·1장 19곳.
--
-- 멱등 — 여러 번 돌려도 같은 값이 된다.
update booth b
   set images = to_jsonb(v.images)
  from (values
  ('C02', array['/booths/house-archive/C02-1.webp', '/booths/house-archive/C02-2.webp', '/booths/house-archive/C02-3.webp']),  -- 더퍼블리셔
  ('C03', array['/booths/house-archive/C03-1.webp', '/booths/house-archive/C03-2.webp', '/booths/house-archive/C03-3.webp']),  -- 라이프앤콜렉트
  ('C04', array['/booths/house-archive/C04-1.webp', '/booths/house-archive/C04-2.webp']),  -- 플로피
  ('C05', array['/booths/house-archive/C05-1.webp', '/booths/house-archive/C05-2.webp']),  -- 도넛바이닐샵
  ('C06', array['/booths/house-archive/C06-1.webp', '/booths/house-archive/C06-2.webp']),  -- 오티에이치콤마
  ('C07', array['/booths/house-archive/C07-1.webp', '/booths/house-archive/C07-2.webp']),  -- 쑤파클링레모네이드
  ('C08', array['/booths/house-archive/C08-1.webp']),  -- 꼬모다미
  ('C09', array['/booths/house-archive/C09-1.webp', '/booths/house-archive/C09-2.webp']),  -- 오브코흐
  ('C10', array['/booths/house-archive/C10-1.webp']),  -- 사유
  ('C11', array['/booths/house-archive/C11-1.webp', '/booths/house-archive/C11-2.webp']),  -- 퀘스처너스
  ('C12', array['/booths/house-archive/C12-1.webp', '/booths/house-archive/C12-2.webp']),  -- 무니버니
  ('C13', array['/booths/house-archive/C13-1.webp', '/booths/house-archive/C13-2.webp']),  -- 비온뒤
  ('C14', array['/booths/house-archive/C14-1.webp', '/booths/house-archive/C14-2.webp']),  -- 누땡스
  ('C15', array['/booths/house-archive/C15-1.webp', '/booths/house-archive/C15-2.webp']),  -- 터틀넥프레스
  ('E01', array['/booths/house-archive/E01-1.webp', '/booths/house-archive/E01-2.webp']),  -- 선데이플래닛47 X 레어로우
  ('E02', array['/booths/house-archive/E02-1.webp', '/booths/house-archive/E02-2.webp']),  -- 담초
  ('E03', array['/booths/house-archive/E03-1.webp', '/booths/house-archive/E03-2.webp']),  -- 나무아일랜드
  ('E04', array['/booths/house-archive/E04-1.webp', '/booths/house-archive/E04-2.webp']),  -- 플레인가든
  ('E05', array['/booths/house-archive/E05-1.webp', '/booths/house-archive/E05-2.webp']),  -- 스테이로스트
  ('E06', array['/booths/house-archive/E06-1.webp', '/booths/house-archive/E06-2.webp']),  -- 엠크라프트
  ('E07', array['/booths/house-archive/E07-1.webp', '/booths/house-archive/E07-2.webp']),  -- 아소브네
  ('E08', array['/booths/house-archive/E08-1.webp', '/booths/house-archive/E08-2.webp']),  -- LG 티운
  ('E10', array['/booths/house-archive/E10-1.webp', '/booths/house-archive/E10-2.webp']),  -- 로우리트 콜렉티브
  ('E11', array['/booths/house-archive/E11-1.webp']),  -- 아세도라
  ('E12', array['/booths/house-archive/E12-1.webp', '/booths/house-archive/E12-2.webp']),  -- 리베이퍼
  ('E13', array['/booths/house-archive/E13-1.webp']),  -- 코코라커
  ('G01', array['/booths/house-archive/G01-1.webp', '/booths/house-archive/G01-2.webp']),  -- 라이프집 스토어
  ('G02', array['/booths/house-archive/G02-1.webp', '/booths/house-archive/G02-2.webp']),  -- 소로이샵
  ('G03', array['/booths/house-archive/G03-1.webp', '/booths/house-archive/G03-2.webp']),  -- 커먼즈
  ('G04', array['/booths/house-archive/G04-1.webp', '/booths/house-archive/G04-2.webp']),  -- 오파츠걸즈
  ('G06', array['/booths/house-archive/G06-1.webp']),  -- 봄마음
  ('G07', array['/booths/house-archive/G07-1.webp', '/booths/house-archive/G07-2.webp']),  -- 얄라
  ('G08', array['/booths/house-archive/G08-1.webp', '/booths/house-archive/G08-2.webp']),  -- 메멜트
  ('G09', array['/booths/house-archive/G09-1.webp']),  -- 키들
  ('G10', array['/booths/house-archive/G10-1.webp']),  -- 솥밭
  ('G11', array['/booths/house-archive/G11-1.webp', '/booths/house-archive/G11-2.webp']),  -- 토마로우
  ('G12', array['/booths/house-archive/G12-1.webp']),  -- 스밋
  ('G13', array['/booths/house-archive/G13-1.webp']),  -- 엠더블유엠
  ('G14', array['/booths/house-archive/G14-1.webp', '/booths/house-archive/G14-2.webp']),  -- 맹그로브 부동산
  ('H03', array['/booths/house-archive/H03-1.webp']),  -- 창작의 집 X 아지카진 매직월드
  ('H04', array['/booths/house-archive/H04-1.webp', '/booths/house-archive/H04-2.webp']),  -- 쉼의 집 X 모티프원
  ('H05', array['/booths/house-archive/H05-1.webp']),  -- 탐험의 집 X 샤론
  ('M02', array['/booths/house-archive/M02-1.webp', '/booths/house-archive/M02-2.webp']),  -- 슌
  ('M03', array['/booths/house-archive/M03-1.webp', '/booths/house-archive/M03-2.webp']),  -- 누아&누키트
  ('M04', array['/booths/house-archive/M04-1.webp']),  -- 아지카진 매직월드
  ('M05', array['/booths/house-archive/M05-1.webp']),  -- 데이오프프로젝트
  ('M06', array['/booths/house-archive/M06-1.webp', '/booths/house-archive/M06-2.webp']),  -- 습작실 by 커버서울
  ('M07', array['/booths/house-archive/M07-1.webp', '/booths/house-archive/M07-2.webp']),  -- 낼나
  ('M08', array['/booths/house-archive/M08-1.webp', '/booths/house-archive/M08-2.webp']),  -- 팩앤폴드
  ('M09', array['/booths/house-archive/M09-1.webp', '/booths/house-archive/M09-2.webp']),  -- 페블온
  ('M10', array['/booths/house-archive/M10-1.webp', '/booths/house-archive/M10-2.webp']),  -- 단단라이프
  ('M11', array['/booths/house-archive/M11-1.webp']),  -- 희다가든
  ('M12', array['/booths/house-archive/M12-1.webp']),  -- 페페하우스
  ('M13', array['/booths/house-archive/M13-1.webp', '/booths/house-archive/M13-2.webp']),  -- 까요미스튜디오
  ('R01', array['/booths/house-archive/R01-1.webp', '/booths/house-archive/R01-2.webp']),  -- 복복복
  ('R02', array['/booths/house-archive/R02-1.webp', '/booths/house-archive/R02-2.webp']),  -- 밑미
  ('R03', array['/booths/house-archive/R03-1.webp']),  -- 카인드오브썸머
  ('R04', array['/booths/house-archive/R04-1.webp', '/booths/house-archive/R04-2.webp']),  -- 네츄럴굿띵스
  ('R05', array['/booths/house-archive/R05-1.webp', '/booths/house-archive/R05-2.webp']),  -- 옥산백
  ('R06', array['/booths/house-archive/R06-1.webp', '/booths/house-archive/R06-2.webp']),  -- 리재
  ('R07', array['/booths/house-archive/R07-1.webp']),  -- 물 수
  ('R08', array['/booths/house-archive/R08-1.webp', '/booths/house-archive/R08-2.webp']),  -- 부부티
  ('R09', array['/booths/house-archive/R09-1.webp', '/booths/house-archive/R09-2.webp']),  -- 해비터스
  ('R10', array['/booths/house-archive/R10-1.webp']),  -- 산새
  ('R11', array['/booths/house-archive/R11-1.webp']),  -- 수푸이
  ('R12', array['/booths/house-archive/R12-1.webp', '/booths/house-archive/R12-2.webp']),  -- 탈로리피
  ('R13', array['/booths/house-archive/R13-1.webp', '/booths/house-archive/R13-2.webp']),  -- 뷰릿
  ('T02', array['/booths/house-archive/T02-1.webp', '/booths/house-archive/T02-2.webp']),  -- 아워아워
  ('T03', array['/booths/house-archive/T03-1.webp', '/booths/house-archive/T03-2.webp']),  -- 나로에
  ('T04', array['/booths/house-archive/T04-1.webp', '/booths/house-archive/T04-2.webp']),  -- 안 안
  ('T06', array['/booths/house-archive/T06-1.webp', '/booths/house-archive/T06-2.webp']),  -- 컨트롤에이
  ('T07', array['/booths/house-archive/T07-1.webp', '/booths/house-archive/T07-2.webp']),  -- E1E_studio
  ('T08', array['/booths/house-archive/T08-1.webp', '/booths/house-archive/T08-2.webp']),  -- 카랑카랑
  ('T09', array['/booths/house-archive/T09-1.webp', '/booths/house-archive/T09-2.webp']),  -- 단어의 시각적 번역
  ('T11', array['/booths/house-archive/T11-1.webp', '/booths/house-archive/T11-2.webp']),  -- 블루토마토즈
  ('T12', array['/booths/house-archive/T12-1.webp', '/booths/house-archive/T12-2.webp']),  -- 멍주
  ('T13', array['/booths/house-archive/T13-1.webp', '/booths/house-archive/T13-2.webp']),  -- 고동상
  ('T14', array['/booths/house-archive/T14-1.webp', '/booths/house-archive/T14-2.webp']),  -- 나꽁아꽁
  ('T15', array['/booths/house-archive/T15-1.webp', '/booths/house-archive/T15-2.webp']),  -- 레이지 수
  ('T16', array['/booths/house-archive/T16-1.webp', '/booths/house-archive/T16-2.webp']),  -- 쏘잉어스
  ('T17', array['/booths/house-archive/T17-1.webp', '/booths/house-archive/T17-2.webp']),  -- 필화
  ('T20', array['/booths/house-archive/T20-1.webp', '/booths/house-archive/T20-2.webp']),  -- 스튜디오 파도나무
  ('T21', array['/booths/house-archive/T21-1.webp', '/booths/house-archive/T21-2.webp']),  -- 계획을 썹포트
  ('T22', array['/booths/house-archive/T22-1.webp', '/booths/house-archive/T22-2.webp']),  -- 라이키드
  ('T23', array['/booths/house-archive/T23-1.webp', '/booths/house-archive/T23-2.webp']),  -- 삐칸
  ('T24', array['/booths/house-archive/T24-1.webp', '/booths/house-archive/T24-2.webp']),  -- 컬렉티브 아카이브
  ('T25', array['/booths/house-archive/T25-1.webp', '/booths/house-archive/T25-2.webp']),  -- 빌리빈밀림
  ('T26', array['/booths/house-archive/T26-1.webp', '/booths/house-archive/T26-2.webp'])  -- 말린
  ) as v(code, images)
 where b.exhibition_id = 'exh_house_archive_2026'
   and b.code = v.code;

-- 확인용:
--   select code, jsonb_array_length(images) from booth
--    where exhibition_id='exh_house_archive_2026'
--      and code not in ('C01','E09','H01','H02','M01','T01','T05','T10')
--    order by code;
--   -- 88행, 각 2~3
