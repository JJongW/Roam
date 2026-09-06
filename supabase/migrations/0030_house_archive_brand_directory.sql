-- 하우스 아카이브 부스 소개·이미지·인스타·로미 한 줄 주입(68/104).
--
-- 0027은 도면에서 뽑은 좌표와 이름만 넣었다. 그 뒤 주최 측 브랜드 디렉터리(CSV 69행 +
-- 인스타 이미지 69장)를 받아 mock 시드에 붙였는데, 운영은 Supabase를 읽으므로 같은
-- 내용을 여기서도 넣어야 화면이 같아진다.
--
-- 두 테이블이다. booth만 채우면 피드 카드의 로미 한 줄이 운영에서만 빈다 —
-- listBoothsByExhibitionId(repository.ts)가 booth_enrichment를 조인해 근거 카드를
-- 만들기 때문이다(roam_interpretation이 그 한 줄의 진짜 출처).
--
-- 이미지는 원본(1568x662 캔버스에 검은 여백 + 페어 헤더/날짜 바)을 트림·크롭해 480px
-- webp로 줄여 레포에 커밋했다(장당 ~20KB). 재생성:
--   node scripts/gen-house-archive-enrichment.mjs
--
-- 멱등 — 여러 번 돌려도 같은 값이 된다.

-- 1) 부스 본문 — code로 조인(이 전시 안에서 자연키).
update booth b
   set description   = v.summary,
       instagram_url = v.instagram_url,
       logo_url      = v.image,
       images        = to_jsonb(array[v.image])
  from (values
  ('C01', '1874년 설립된 조명 브랜드로, 덴마크 디자인 전통을 계승한 조명 제품을 선보입니다.', 'https://instagram.com/louispoulsen', '/booths/house-archive/C01.webp'),
  ('C02', '아로마테라피 클래스 등을 운영하는 라이프스타일 브랜드입니다.', 'https://instagram.com/thepublisher_official', '/booths/house-archive/C02.webp'),
  ('C03', 'life&COLLECT 는 The art of Living, 생활의 예술을 실천하는 디자인 콜렉티브입니다.', 'https://instagram.com/lifeandcollect', '/booths/house-archive/C03.webp'),
  ('C04', '“Everyday Narrative Becomes Inspiration” - 일상 속 작은 영감을 이야기하는 브랜드입니다.', 'https://instagram.com/flopy.seoul', '/booths/house-archive/C04.webp'),
  ('C05', '일상 속 작은 행복을 전하는 아이템을 만드는 라이프스타일 브랜드, DONUTVINYLSHOP.', 'https://instagram.com/donutvinylshop', '/booths/house-archive/C05.webp'),
  ('C06', 'Oth,는 다양한 물성을 활용해 이야기를 들려주고, 그 이야기들이 간접적 체험이 가능할 수 있도록 브랜드를 전개하고 있습니다.', 'https://instagram.com/othcomma', '/booths/house-archive/C06.webp'),
  ('C07', '통영에서 받은 영감으로 여름의 공기와 바다의 온도를 담아내는 라이프스타일 브랜드입니다.', 'https://instagram.com/sooparklinglemonade', '/booths/house-archive/C07.webp'),
  ('C08', '30년 넘게 재봉틀을 한 엄마와 귀여움을 찾아 다니는 딸이 함께 만든 브랜드 ’꼬모다미‘입니다.', 'https://instagram.com/soobong_moonbang9', '/booths/house-archive/C08.webp'),
  ('C09', '포스터와 홈데코 오브제를 통해 공간의 분위기를 제안하는 라이프스타일 브랜드입니다.', 'https://instagram.com/ofcoh.official', '/booths/house-archive/C09.webp'),
  ('C10', '사유(SAYOO)는 본질을 담은 아이웨어 브랜드입니다.', 'https://instagram.com/sayoo.kr', '/booths/house-archive/C10.webp'),
  ('C11', '금속공예를 기반으로 한 인테리어 오브제를 제작하는 브랜드입니다.', 'https://instagram.com/questioners.official', '/booths/house-archive/C11.webp'),
  ('C12', '픽셀 디자인과 한국적 감성을 결합해 일상에 즐거움을 더하는 라이프스타일 브랜드입니다.', 'https://instagram.com/moonybunny.official', '/booths/house-archive/C12.webp'),
  ('C13', '좋은 종이 위에서 각자의 방식으로 기록하는 즐거움을 제안하는 디자인 문구 브랜드입니다.', 'https://instagram.com/beond_kr', '/booths/house-archive/C13.webp'),
  ('C14', '⌈기록하는 사람, 만드는 사람⌋ 누땡스를 운영하는 원영재는 사진을 찍고, 책을 만들고, 브랜드를 운영합니다.', 'https://instagram.com/nuthanks', '/booths/house-archive/C14.webp'),
  ('C15', '책 때문에 거북목이 된 사람들을 위한 브랜드, 터틀넥프레스입니다.', 'https://instagram.com/turtleneck_press', '/booths/house-archive/C15.webp'),
  ('E01', '‘식물과 어떻게 함께 살 것인가’라는 고민에서 출발한 브랜드로, 레어로우와 콜라보 부스를 운영합니다. / 레어로우: 철제라는 소재의 본질을 간결한 구조와 다양한 컬러로 풀어내는 브랜드로, 선데이플래닛47과 콜라보 부스를 운영합니다.', 'https://instagram.com/sundayplanet47', '/booths/house-archive/E01.webp'),
  ('E02', '“이게 뭐예요?” 담초가 가장 많이 듣는 질문입니다 (작은 유리 속 정원 브랜드).', 'https://instagram.com/damcho_o', '/booths/house-archive/E02.webp'),
  ('E03', '나무아일랜드는 오래된 나무의 이야기를 담는 브랜드입니다. 청주를 기반으로, 나무 관련 사진과 이야기를 기록하고 제품으로 전합니다.', 'https://instagram.com/namuisland_official', '/booths/house-archive/E03.webp'),
  ('E04', '나만의 정원을 가꾸는 생각과 사물이 모이는 공간(브랜드)입니다.', 'https://instagram.com/pleinegarden', '/booths/house-archive/E04.webp'),
  ('E05', '‘길을 잃어도 괜찮아요’를 모토로 하는 커피 라이프 브랜드입니다.', 'https://instagram.com/staylost.kr', '/booths/house-archive/E05.webp'),
  ('E06', '1987년 부산의 작은 공방에서 시작된 가방 브랜드로, 40여 년의 역사를 지녔습니다.', 'https://instagram.com/mcraft1987', '/booths/house-archive/E06.webp'),
  ('E07', '슬로바키아어로 ‘개인적인’이라는 뜻의 osobné에서 시작된 스몰 도자 브랜드입니다.', 'https://instagram.com/asobne', '/booths/house-archive/E07.webp'),
  ('E08', '손쉽게 키우고 꾸미는 나만의 작은 정원, LG 틔운. 초보 식집사도 손쉽게 키울 수 있는 틔운 미니를 하우스 아카이브에서 만나보세요!', 'https://instagram.com/lg_tiiun_official', '/booths/house-archive/E08.webp'),
  ('E09', '4T는 야생화를 시작으로 실내 관엽식물, 난초까지 다양한 종류의 식물을 선보이는 식물 편집숍입니다.', 'https://instagram.com/4t___official', '/booths/house-archive/E09.webp'),
  ('E10', '현대미술 작가, 디자이너, 아트디렉터가 함께하는 리퍼포징(Repurposing) 스튜디오입니다.', 'https://instagram.com/lowlit.co', '/booths/house-archive/E10.webp'),
  ('E11', '자연 소재와 수작업의 가치를 바탕으로 공간과 일상에 감성을 더하는 패브릭 제품을 만듭니다.', 'https://instagram.com/hacedora_studio', '/booths/house-archive/E11.webp'),
  ('E12', '집 안 욕실에서 시작되는 회복 루틴을 제안하는 웰니스 뷰티 브랜드입니다.', 'https://instagram.com/revapor.official', '/booths/house-archive/E12.webp'),
  ('E13', '30년간 국내에서 키친웨어를 제조해온 기술력을 바탕으로 탄생한 프리미엄 라이프스타일 키친웨어 브랜드입니다.', 'https://instagram.com/coco_locker', '/booths/house-archive/E13.webp'),
  ('G01', '‘우리는 집에서 무엇이든 할 수 있지’를 바탕으로, 집을 새로운 경험과 취향의 놀이터로 제안하는 라이프스타일 브랜드입니다.', 'https://instagram.com/lifezip_store', '/booths/house-archive/G01.webp'),
  ('G02', '식탁위의 작은 행복, 소로이샵 - 테이블 위 작은 것들을 소개하는 키친&테이블웨어 셀렉트샵입니다.', 'https://instagram.com/soroishop', '/booths/house-archive/G02.webp'),
  ('G03', '삶의 방식이 집이 되는 새로운 형태의 아파트로, 11가지 평형과 커뮤니티를 만들어가는 주거 공동체입니다.', 'https://instagram.com/commons.apt', '/booths/house-archive/G03.webp'),
  ('G04', '마법소녀와 고양이 간의 오랜 서사를 재해석한 콘셉츄얼 펫브랜드입니다.', 'https://instagram.com/oopartsgirls', '/booths/house-archive/G04.webp'),
  ('G05', '일상속 포인트가 될 수 있는 도자기 제품을 제안하는 국내 세라믹 브랜드입니다.', 'https://instagram.com/make.a.pottery', '/booths/house-archive/G05.webp'),
  ('G06', '하루 세 번, 가장 가까이서 봄마음을 전합니다.', 'https://instagram.com/bommaum_official', '/booths/house-archive/G06.webp'),
  ('G07', '채소가 식탁의 중심이 될 때 일상이 더 생기롭고 다정해진다고 믿는 브랜드입니다.', 'https://instagram.com/yalla_kr', '/booths/house-archive/G07.webp'),
  ('G08', '2016년부터 크림치즈 단일 품목만을 판매해온 크림치즈 전문점입니다.', 'https://instagram.com/memelt_dessert', '/booths/house-archive/G08.webp'),
  ('G09', '치과의사 동생과 조향사 언니가 만든 프리미엄 고체 가글 브랜드입니다.', 'https://instagram.com/keedle.official', '/booths/house-archive/G09.webp'),
  ('G10', '산청토(山淸土)로 손수 빚어낸 한국의 프리미엄 세라믹 솥 브랜드입니다.', 'https://instagram.com/momo__sotbat', '/booths/house-archive/G10.webp'),
  ('G11', '강원도 영월의 유기농 토마토 농장 그래도팜이 직접 운영하는 라이프스타일 브랜드입니다.', 'https://instagram.com/farm_nevertheless', '/booths/house-archive/G11.webp'),
  ('G12', '2006년부터 국내 최고의 스테인리스 스틸을 다뤄온 제조기업 ‘창대산업’에서 출발한 라이프스타일 브랜드입니다.', 'https://instagram.com/smitstainless', '/booths/house-archive/G12.webp'),
  ('G13', 'mwm은 2018년 서울 을지로에서 시작된 컬러 클레이 기반의 ceramic studio & café 브랜드입니다.', 'https://instagram.com/mwm_seoul', '/booths/house-archive/G13.webp'),
  ('G14', '하우스 아카이브 라운지에서 워크숍 프로그램을 운영하는 브랜드입니다.', 'https://instagram.com/mangrove.city', '/booths/house-archive/G14.webp'),
  ('M01', '글쓰기를 더욱 즐겁고 편리하게 만드는 필기구 브랜드입니다.', 'https://instagram.com/koreapilot.official', '/booths/house-archive/M01.webp'),
  ('M02', '일상의 작은 순간을 따뜻한 시선과 섬세한 그림으로 기록하는 일러스트레이터·인스타툰 작가입니다.', 'https://instagram.com/shunyoon', '/booths/house-archive/M02.webp'),
  ('M03', 'about 누아 - 그저 미술이 좋아서 인생의 절반 이상의 시간 동안 그림을 그렸다.', 'https://instagram.com/libere_nuage', '/booths/house-archive/M03.webp'),
  ('M04', '스스로를 ‘미디어 믹스 창작 집단’이라고 소개하는 브랜드입니다.', 'https://instagram.com/azikazinmagicworld', '/booths/house-archive/M04.webp'),
  ('M05', '디자이너 논디가 운영하는 산업디자인 기반의 브랜드입니다.', 'https://instagram.com/day_off_project', '/booths/house-archive/M05.webp'),
  ('M06', '커버서울이 운영하는 오프라인 스토어로, 건강한 일상 습관을 시도해보는 습관작업실입니다.', 'https://instagram.com/coverseoul.official', '/booths/house-archive/M06.webp'),
  ('M07', '성장하는 어른을 위한 요즘 문구점, 낼나입니다.', 'https://instagram.com/nelna.shop', '/booths/house-archive/M07.webp'),
  ('M08', '불필요한 것을 덜어내고, 더 가볍고 정돈된 일상을 제안하는 라이프스타일 브랜드입니다.', 'https://instagram.com/pack_n_fold', '/booths/house-archive/M08.webp'),
  ('M09', '책상에서 시작되는 작은 성공을 응원하는 브랜드, 페블온입니다.', 'https://instagram.com/pebble_on', '/booths/house-archive/M09.webp'),
  ('M10', '“오늘의 조각을 모아 만드는 더 단단한 내일” - 쉬운 기록을 돕는 문구를 제작하고 있습니다.', 'https://instagram.com/dandanlife_', '/booths/house-archive/M10.webp'),
  ('M11', '직접 그린 러프한 그림들을 일상 속 소품에 담아 취향이 자라나는 공간을 제안하는 아트 브랜드입니다.', 'https://instagram.com/heedagarden', '/booths/house-archive/M11.webp'),
  ('M12', 'Found in Everyday - 일상에서 영감을 얻는 브랜드입니다.', 'https://instagram.com/fefehaus', '/booths/house-archive/M12.webp'),
  ('M13', '까요미스튜디오는 서울 성수동에 위치한 커스텀주얼리 공방으로, 10년 이상 축적된 노하우를 바탕으로 다양한 공예 콘텐츠를 선보입니다.', 'https://instagram.com/kkayomi.studio', '/booths/house-archive/M13.webp'),
  ('R01', '동양적 개념의 ‘복’을 컨셉으로 한 감각의 선물 특화 브랜드입니다.', 'https://instagram.com/bokbokbok_seoul', '/booths/house-archive/R01.webp'),
  ('R02', '있는 그대로의 나를 발견하도록 돕는 브랜드입니다.', 'https://instagram.com/nicetomeetme.kr', '/booths/house-archive/R02.webp'),
  ('R03', '사진가 황선하의 작업에서 시작된 브랜드입니다.', 'https://instagram.com/kindofsummer_official', '/booths/house-archive/R03.webp'),
  ('R04', '유독 마음이 편안했던 하루를 떠올려 보세요. 아마 몸도 한결 가볍고 편안했던 날이었을 거예요.', 'https://instagram.com/ngt_kr', '/booths/house-archive/R04.webp'),
  ('R05', '전통 백옥을 담은 일상 정화 브랜드, 옥산백.', 'https://instagram.com/oksan.100', '/booths/house-archive/R05.webp'),
  ('R06', '재료와 쓰임의 가능성을 다시 바라보며, 일상에 오래 머무는 사물을 만듭니다.', 'https://instagram.com/reje.official', '/booths/house-archive/R06.webp'),
  ('R07', '한국의 전통 천연 섬유를 기반으로 욕실용품을 개발하는 프리미엄 웰니스 라이프스타일 브랜드입니다.', 'https://instagram.com/moolsoo.official', '/booths/house-archive/R07.webp'),
  ('R08', '100% 차나무 잎만을 사용하는 우롱차 전문 브랜드입니다.', 'https://instagram.com/bubuti_official', '/booths/house-archive/R08.webp'),
  ('R09', '‘익숙하지만 소외된 아름다움’에 주목하는 디자인 철학을 기반으로 활동하는 브랜드입니다.', 'https://instagram.com/habitus.kr', '/booths/house-archive/R09.webp'),
  ('R10', '1985년부터 이어온 서울 성수동 솜 공장의 손길로 태어난 명상 용품, 라이프스타일 브랜드입니다.', 'https://instagram.com/sansae_kr', '/booths/house-archive/R10.webp'),
  ('R11', '자연 소재로 베이스웨어를 만드는 브랜드입니다.', 'https://instagram.com/soopui_basewear', '/booths/house-archive/R11.webp'),
  ('R12', '2020년 론칭한 국내 디자이너 브랜드입니다.', 'https://instagram.com/talo.ryyppy', '/booths/house-archive/R12.webp'),
  ('R13', '여성을 위한 홈필라테스 브랜드입니다.', 'https://instagram.com/beaurit_official', '/booths/house-archive/R13.webp')
  ) as v(code, summary, instagram_url, image)
 where b.exhibition_id = 'exh_house_archive_2026'
   and b.code = v.code;

-- 2) enrichment — booth.id로 잇는다(0027이 'ha_' || lower(code) 규칙으로 넣었다).
--    goods_keywords·theme_tags는 jsonb라 빈 배열도 '[]'::jsonb로 넣어야 한다.
insert into booth_enrichment (
  booth_id, summary, source_url, roam_interpretation,
  goods_keywords, theme_tags, updated_at
)
select v.booth_id, v.summary, v.source_url, v.roam_interpretation,
       '[]'::jsonb, '[]'::jsonb, now()
  from (values
  ('ha_c01', '1874년 설립된 조명 브랜드로, 덴마크 디자인 전통을 계승한 조명 제품을 선보입니다.', 'https://instagram.com/louispoulsen', '1874년부터 이어온 덴마크 조명 브랜드야.'),
  ('ha_c02', '아로마테라피 클래스 등을 운영하는 라이프스타일 브랜드입니다.', 'https://instagram.com/thepublisher_official', '아로마테라피 클래스도 여는 라이프스타일 브랜드야.'),
  ('ha_c03', 'life&COLLECT 는 The art of Living, 생활의 예술을 실천하는 디자인 콜렉티브입니다.', 'https://instagram.com/lifeandcollect', '‘생활의 예술’을 내건 디자인 콜렉티브야.'),
  ('ha_c04', '“Everyday Narrative Becomes Inspiration” - 일상 속 작은 영감을 이야기하는 브랜드입니다.', 'https://instagram.com/flopy.seoul', '일상의 작은 영감을 이야기하는 브랜드야.'),
  ('ha_c05', '일상 속 작은 행복을 전하는 아이템을 만드는 라이프스타일 브랜드, DONUTVINYLSHOP.', 'https://instagram.com/donutvinylshop', '일상에 작은 행복 얹는 소품을 만들어.'),
  ('ha_c06', 'Oth,는 다양한 물성을 활용해 이야기를 들려주고, 그 이야기들이 간접적 체험이 가능할 수 있도록 브랜드를 전개하고 있습니다.', 'https://instagram.com/othcomma', '여러 물성으로 이야기를 만드는 브랜드야.'),
  ('ha_c07', '통영에서 받은 영감으로 여름의 공기와 바다의 온도를 담아내는 라이프스타일 브랜드입니다.', 'https://instagram.com/sooparklinglemonade', '통영의 여름과 바다를 담은 라이프스타일 브랜드야.'),
  ('ha_c08', '30년 넘게 재봉틀을 한 엄마와 귀여움을 찾아 다니는 딸이 함께 만든 브랜드 ’꼬모다미‘입니다.', 'https://instagram.com/soobong_moonbang9', '30년 재봉틀 잡은 엄마랑 딸이 같이 만드는 브랜드야.'),
  ('ha_c09', '포스터와 홈데코 오브제를 통해 공간의 분위기를 제안하는 라이프스타일 브랜드입니다.', 'https://instagram.com/ofcoh.official', '포스터랑 홈데코 오브제로 공간 분위기를 제안해.'),
  ('ha_c10', '사유(SAYOO)는 본질을 담은 아이웨어 브랜드입니다.', 'https://instagram.com/sayoo.kr', '본질만 남긴 아이웨어 브랜드야.'),
  ('ha_c11', '금속공예를 기반으로 한 인테리어 오브제를 제작하는 브랜드입니다.', 'https://instagram.com/questioners.official', '금속공예로 인테리어 오브제를 만들어.'),
  ('ha_c12', '픽셀 디자인과 한국적 감성을 결합해 일상에 즐거움을 더하는 라이프스타일 브랜드입니다.', 'https://instagram.com/moonybunny.official', '픽셀 디자인에 한국적 감성을 섞는 브랜드야.'),
  ('ha_c13', '좋은 종이 위에서 각자의 방식으로 기록하는 즐거움을 제안하는 디자인 문구 브랜드입니다.', 'https://instagram.com/beond_kr', '좋은 종이에 기록하는 재미를 파는 문구 브랜드야.'),
  ('ha_c14', '⌈기록하는 사람, 만드는 사람⌋ 누땡스를 운영하는 원영재는 사진을 찍고, 책을 만들고, 브랜드를 운영합니다.', 'https://instagram.com/nuthanks', '사진 찍고 책 만드는 사람이 운영하는 브랜드야.'),
  ('ha_c15', '책 때문에 거북목이 된 사람들을 위한 브랜드, 터틀넥프레스입니다.', 'https://instagram.com/turtleneck_press', '책 보다 거북목 된 사람들을 위한 브랜드야.'),
  ('ha_e01', '‘식물과 어떻게 함께 살 것인가’라는 고민에서 출발한 브랜드로, 레어로우와 콜라보 부스를 운영합니다. / 레어로우: 철제라는 소재의 본질을 간결한 구조와 다양한 컬러로 풀어내는 브랜드로, 선데이플래닛47과 콜라보 부스를 운영합니다.', 'https://instagram.com/sundayplanet47', '식물 브랜드랑 철제 가구 브랜드가 같이 여는 부스야.'),
  ('ha_e02', '“이게 뭐예요?” 담초가 가장 많이 듣는 질문입니다 (작은 유리 속 정원 브랜드).', 'https://instagram.com/damcho_o', '작은 유리 안에 정원을 만드는 곳이야.'),
  ('ha_e03', '나무아일랜드는 오래된 나무의 이야기를 담는 브랜드입니다. 청주를 기반으로, 나무 관련 사진과 이야기를 기록하고 제품으로 전합니다.', 'https://instagram.com/namuisland_official', '오래된 나무의 이야기를 기록하고 제품으로 만들어.'),
  ('ha_e04', '나만의 정원을 가꾸는 생각과 사물이 모이는 공간(브랜드)입니다.', 'https://instagram.com/pleinegarden', '나만의 정원을 가꾸는 물건들이 모인 곳이야.'),
  ('ha_e05', '‘길을 잃어도 괜찮아요’를 모토로 하는 커피 라이프 브랜드입니다.', 'https://instagram.com/staylost.kr', '‘길을 잃어도 괜찮아’가 모토인 커피 브랜드야.'),
  ('ha_e06', '1987년 부산의 작은 공방에서 시작된 가방 브랜드로, 40여 년의 역사를 지녔습니다.', 'https://instagram.com/mcraft1987', '1987년 부산 공방에서 시작한 40년 된 가방 브랜드야.'),
  ('ha_e07', '슬로바키아어로 ‘개인적인’이라는 뜻의 osobné에서 시작된 스몰 도자 브랜드입니다.', 'https://instagram.com/asobne', '‘개인적인’이란 뜻에서 출발한 작은 도자 브랜드야.'),
  ('ha_e08', '손쉽게 키우고 꾸미는 나만의 작은 정원, LG 틔운. 초보 식집사도 손쉽게 키울 수 있는 틔운 미니를 하우스 아카이브에서 만나보세요!', 'https://instagram.com/lg_tiiun_official', '집에서 식물 키우는 작은 정원 가전이야. 틔운 미니를 가져왔대.'),
  ('ha_e09', '4T는 야생화를 시작으로 실내 관엽식물, 난초까지 다양한 종류의 식물을 선보이는 식물 편집숍입니다.', 'https://instagram.com/4t___official', '야생화부터 난초까지 파는 식물 편집숍이야.'),
  ('ha_e10', '현대미술 작가, 디자이너, 아트디렉터가 함께하는 리퍼포징(Repurposing) 스튜디오입니다.', 'https://instagram.com/lowlit.co', '버려진 걸 다시 쓰는 리퍼포징 스튜디오야. 작가랑 디자이너가 같이 해.'),
  ('ha_e11', '자연 소재와 수작업의 가치를 바탕으로 공간과 일상에 감성을 더하는 패브릭 제품을 만듭니다.', 'https://instagram.com/hacedora_studio', '자연 소재로 손수 만드는 패브릭 브랜드야.'),
  ('ha_e12', '집 안 욕실에서 시작되는 회복 루틴을 제안하는 웰니스 뷰티 브랜드입니다.', 'https://instagram.com/revapor.official', '집 욕실에서 하는 회복 루틴을 제안하는 뷰티 브랜드야.'),
  ('ha_e13', '30년간 국내에서 키친웨어를 제조해온 기술력을 바탕으로 탄생한 프리미엄 라이프스타일 키친웨어 브랜드입니다.', 'https://instagram.com/coco_locker', '30년 키친웨어 만들던 기술로 낸 주방용품 브랜드야.'),
  ('ha_g01', '‘우리는 집에서 무엇이든 할 수 있지’를 바탕으로, 집을 새로운 경험과 취향의 놀이터로 제안하는 라이프스타일 브랜드입니다.', 'https://instagram.com/lifezip_store', '‘집에서 뭐든 할 수 있지’를 내건 라이프스타일 브랜드야.'),
  ('ha_g02', '식탁위의 작은 행복, 소로이샵 - 테이블 위 작은 것들을 소개하는 키친&테이블웨어 셀렉트샵입니다.', 'https://instagram.com/soroishop', '테이블 위 작은 물건만 모은 셀렉트샵이야.'),
  ('ha_g03', '삶의 방식이 집이 되는 새로운 형태의 아파트로, 11가지 평형과 커뮤니티를 만들어가는 주거 공동체입니다.', 'https://instagram.com/commons.apt', '11가지 평형으로 짓는 주거 공동체 이야기야.'),
  ('ha_g04', '마법소녀와 고양이 간의 오랜 서사를 재해석한 콘셉츄얼 펫브랜드입니다.', 'https://instagram.com/oopartsgirls', '마법소녀랑 고양이 서사로 만든 펫 브랜드야.'),
  ('ha_g05', '일상속 포인트가 될 수 있는 도자기 제품을 제안하는 국내 세라믹 브랜드입니다.', 'https://instagram.com/make.a.pottery', '일상에 포인트가 되는 도자기를 만들어.'),
  ('ha_g06', '하루 세 번, 가장 가까이서 봄마음을 전합니다.', 'https://instagram.com/bommaum_official', '하루 세 번 곁에 두는 것들을 만드는 브랜드야.'),
  ('ha_g07', '채소가 식탁의 중심이 될 때 일상이 더 생기롭고 다정해진다고 믿는 브랜드입니다.', 'https://instagram.com/yalla_kr', '채소가 중심인 식탁을 제안하는 브랜드야.'),
  ('ha_g08', '2016년부터 크림치즈 단일 품목만을 판매해온 크림치즈 전문점입니다.', 'https://instagram.com/memelt_dessert', '2016년부터 크림치즈만 만드는 곳이야.'),
  ('ha_g09', '치과의사 동생과 조향사 언니가 만든 프리미엄 고체 가글 브랜드입니다.', 'https://instagram.com/keedle.official', '치과의사랑 조향사가 만든 고체 가글 브랜드야.'),
  ('ha_g10', '산청토(山淸土)로 손수 빚어낸 한국의 프리미엄 세라믹 솥 브랜드입니다.', 'https://instagram.com/momo__sotbat', '산청토로 빚은 한국 세라믹 솥이야.'),
  ('ha_g11', '강원도 영월의 유기농 토마토 농장 그래도팜이 직접 운영하는 라이프스타일 브랜드입니다.', 'https://instagram.com/farm_nevertheless', '영월 유기농 토마토 농장이 직접 하는 브랜드야.'),
  ('ha_g12', '2006년부터 국내 최고의 스테인리스 스틸을 다뤄온 제조기업 ‘창대산업’에서 출발한 라이프스타일 브랜드입니다.', 'https://instagram.com/smitstainless', '스테인리스만 다뤄온 제조사가 낸 브랜드야.'),
  ('ha_g13', 'mwm은 2018년 서울 을지로에서 시작된 컬러 클레이 기반의 ceramic studio & café 브랜드입니다.', 'https://instagram.com/mwm_seoul', '을지로에서 시작한 컬러 클레이 도자 스튜디오야.'),
  ('ha_g14', '하우스 아카이브 라운지에서 워크숍 프로그램을 운영하는 브랜드입니다.', 'https://instagram.com/mangrove.city', '라운지에서 워크숍을 여는 곳이야.'),
  ('ha_m01', '글쓰기를 더욱 즐겁고 편리하게 만드는 필기구 브랜드입니다.', 'https://instagram.com/koreapilot.official', '쓰는 맛을 챙긴 필기구 브랜드야.'),
  ('ha_m02', '일상의 작은 순간을 따뜻한 시선과 섬세한 그림으로 기록하는 일러스트레이터·인스타툰 작가입니다.', 'https://instagram.com/shunyoon', '일상을 그림으로 기록하는 일러스트레이터야.'),
  ('ha_m03', 'about 누아 - 그저 미술이 좋아서 인생의 절반 이상의 시간 동안 그림을 그렸다.', 'https://instagram.com/libere_nuage', '인생 절반을 그림 그린 작가야.'),
  ('ha_m04', '스스로를 ‘미디어 믹스 창작 집단’이라고 소개하는 브랜드입니다.', 'https://instagram.com/azikazinmagicworld', '스스로를 ‘미디어 믹스 창작 집단’이라 부르는 팀이야.'),
  ('ha_m05', '디자이너 논디가 운영하는 산업디자인 기반의 브랜드입니다.', 'https://instagram.com/day_off_project', '산업디자인 기반으로 물건 만드는 디자이너 브랜드야.'),
  ('ha_m06', '커버서울이 운영하는 오프라인 스토어로, 건강한 일상 습관을 시도해보는 습관작업실입니다.', 'https://instagram.com/coverseoul.official', '건강한 습관을 실험해보는 오프라인 작업실이야.'),
  ('ha_m07', '성장하는 어른을 위한 요즘 문구점, 낼나입니다.', 'https://instagram.com/nelna.shop', '어른을 위한 요즘 문구점이야.'),
  ('ha_m08', '불필요한 것을 덜어내고, 더 가볍고 정돈된 일상을 제안하는 라이프스타일 브랜드입니다.', 'https://instagram.com/pack_n_fold', '덜어내고 정돈하는 쪽을 제안하는 브랜드야.'),
  ('ha_m09', '책상에서 시작되는 작은 성공을 응원하는 브랜드, 페블온입니다.', 'https://instagram.com/pebble_on', '책상에서 시작하는 작은 성공을 응원하는 브랜드야.'),
  ('ha_m10', '“오늘의 조각을 모아 만드는 더 단단한 내일” - 쉬운 기록을 돕는 문구를 제작하고 있습니다.', 'https://instagram.com/dandanlife_', '쉽게 기록하게 돕는 문구를 만들어.'),
  ('ha_m11', '직접 그린 러프한 그림들을 일상 속 소품에 담아 취향이 자라나는 공간을 제안하는 아트 브랜드입니다.', 'https://instagram.com/heedagarden', '직접 그린 그림을 일상 소품에 담는 아트 브랜드야.'),
  ('ha_m12', 'Found in Everyday - 일상에서 영감을 얻는 브랜드입니다.', 'https://instagram.com/fefehaus', '일상에서 영감을 줍는 브랜드야.'),
  ('ha_m13', '까요미스튜디오는 서울 성수동에 위치한 커스텀주얼리 공방으로, 10년 이상 축적된 노하우를 바탕으로 다양한 공예 콘텐츠를 선보입니다.', 'https://instagram.com/kkayomi.studio', '성수동 커스텀 주얼리 공방이야. 10년 넘게 했대.'),
  ('ha_r01', '동양적 개념의 ‘복’을 컨셉으로 한 감각의 선물 특화 브랜드입니다.', 'https://instagram.com/bokbokbok_seoul', '‘복’을 컨셉으로 한 선물 브랜드야.'),
  ('ha_r02', '있는 그대로의 나를 발견하도록 돕는 브랜드입니다.', 'https://instagram.com/nicetomeetme.kr', '있는 그대로의 나를 보게 돕는 브랜드야.'),
  ('ha_r03', '사진가 황선하의 작업에서 시작된 브랜드입니다.', 'https://instagram.com/kindofsummer_official', '사진가 황선하의 작업에서 시작된 브랜드야.'),
  ('ha_r04', '유독 마음이 편안했던 하루를 떠올려 보세요. 아마 몸도 한결 가볍고 편안했던 날이었을 거예요.', 'https://instagram.com/ngt_kr', '몸이 가벼웠던 하루를 떠올리게 하는 브랜드야.'),
  ('ha_r05', '전통 백옥을 담은 일상 정화 브랜드, 옥산백.', 'https://instagram.com/oksan.100', '전통 백옥을 쓰는 일상 정화 브랜드야.'),
  ('ha_r06', '재료와 쓰임의 가능성을 다시 바라보며, 일상에 오래 머무는 사물을 만듭니다.', 'https://instagram.com/reje.official', '오래 두고 쓰는 사물을 만드는 곳이야.'),
  ('ha_r07', '한국의 전통 천연 섬유를 기반으로 욕실용품을 개발하는 프리미엄 웰니스 라이프스타일 브랜드입니다.', 'https://instagram.com/moolsoo.official', '한국 전통 천연 섬유로 욕실용품을 만들어.'),
  ('ha_r08', '100% 차나무 잎만을 사용하는 우롱차 전문 브랜드입니다.', 'https://instagram.com/bubuti_official', '차나무 잎만 쓰는 우롱차 전문 브랜드야.'),
  ('ha_r09', '‘익숙하지만 소외된 아름다움’에 주목하는 디자인 철학을 기반으로 활동하는 브랜드입니다.', 'https://instagram.com/habitus.kr', '‘익숙한데 소외된 아름다움’을 보는 디자인 브랜드야.'),
  ('ha_r10', '1985년부터 이어온 서울 성수동 솜 공장의 손길로 태어난 명상 용품, 라이프스타일 브랜드입니다.', 'https://instagram.com/sansae_kr', '1985년부터 이어온 성수동 솜 공장이 만든 명상 용품이야.'),
  ('ha_r11', '자연 소재로 베이스웨어를 만드는 브랜드입니다.', 'https://instagram.com/soopui_basewear', '자연 소재로 베이스웨어 만드는 브랜드야.'),
  ('ha_r12', '2020년 론칭한 국내 디자이너 브랜드입니다.', 'https://instagram.com/talo.ryyppy', '2020년에 시작한 국내 디자이너 브랜드야.'),
  ('ha_r13', '여성을 위한 홈필라테스 브랜드입니다.', 'https://instagram.com/beaurit_official', '여성용 홈필라테스 브랜드야.')
  ) as v(booth_id, summary, source_url, roam_interpretation)
 where exists (select 1 from booth b where b.id = v.booth_id)
on conflict (booth_id) do update set
  summary             = excluded.summary,
  source_url          = excluded.source_url,
  roam_interpretation = excluded.roam_interpretation,
  updated_at          = now();

-- 확인용:
--   select count(*) from booth where exhibition_id='exh_house_archive_2026' and logo_url is not null;   -- 68
--   select count(*) from booth_enrichment where booth_id like 'ha_%' and roam_interpretation is not null; -- 68
