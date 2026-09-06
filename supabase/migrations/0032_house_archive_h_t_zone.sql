-- 하우스 아카이브 부스 소개·이미지·인스타·로미 한 줄 주입 — 기획존(H존) 5팀 + 테이블 마켓(T존) 26팀.
--
-- 0030이 넣은 68개(정규 부스)에 이어, 공식 라인업 게시물(housearchive_kr)로 확보한
-- 기획존 5팀 + 테이블 마켓 26팀을 마저 넣는다. 0027이 이미 이 
31개 부스 행을
-- 'ha_' || lower(code) id로 심어 뒀으므로(도면 기반, 좌표·이름만) 여기서는 UPDATE.
--
-- 두 테이블이다. booth만 채우면 피드 카드의 로미 한 줄이 운영에서만 빈다 —
-- listBoothsByExhibitionId(repository.ts)가 booth_enrichment를 조인해 근거 카드를
-- 만들기 때문이다(roam_interpretation이 그 한 줄의 진짜 출처).
--
-- 이미지는 0030과 달리 주최 측 공용 템플릿(1568x662 여백+헤더/날짜바)이 아니라
-- 게시물 스크린샷을 직접 트림한 것이라, 상하 퍼센트 크롭 없이 트림·480px·webp72만
-- 적용했다(장당 5~65KB). 재생성 스크립트(gen-house-archive-enrichment.mjs)는
-- 이 31개엔 그대로 못 쓴다 — 크롭 로직이 옛 템플릿 전제라 새 이미지를 잘라먹는다.
--
-- 멱등 — 여러 번 돌려도 같은 값이 된다.

-- 1) 부스 본문 — code로 조인(이 전시 안에서 자연키).
update booth b
   set description   = v.summary,
       instagram_url = v.instagram_url,
       logo_url      = v.image,
       images        = to_jsonb(array[v.image])
  from (values
  ('H01', '모든 오래된 것들에 대한 애정을 바탕으로, 한 사람의 진심 어린 취향을 담아 고르고 모아온 빈티지 소품을 선보이는 편집숍입니다. 이번 하우스 아카이브 ''수집의 집''에서는 오랜 시간에 걸쳐 모아온 취향과 이야기가 담긴 공간을 선보입니다.', 'https://instagram.com/bigsleep_shop', '/booths/house-archive/H01.webp'),
  ('H02', '''정해진 형태나 의미에 얽매이지 않은 자유로운 표현''을 이름에 담은 작가로, 회화·도자·가구디자인·설치 등을 아우릅니다. 이번 하우스 아카이브 ''관계의 집''에서는 소브라메사(식탁 대화)에서 영감을 받아 식탁과 대화의 순간들을 그려내고, 직접 만든 식기·가구·오브제로 환대의 풍경을 확장합니다.', 'https://instagram.com/herncworkshop', '/booths/house-archive/H02.webp'),
  ('H03', '5인조 음악·비주얼 크리에이티브 그룹으로, 1st LP 《Memory Overdrive》를 발표했습니다. ''창작의 집'' 주제로 기획존 콜라보 부스에 참가합니다.', 'https://instagram.com/azikazinmagicworld', '/booths/house-archive/H03.webp'),
  ('H04', '2005년부터 이어온 국내 대표 북스테이(Bookstay)로, 헤이리에 위치해 서재·아트스테이 프레농을 운영합니다. 이번 하우스 아카이브 ''쉼의 집'' 주제로 참가합니다.', 'https://instagram.com/motif.1', '/booths/house-archive/H04.webp'),
  ('H05', 'Sharon Kim, 부산·서울 기반 아티스트이자 포토그래퍼로 서핑·음악·사진 콘텐츠를 선보입니다. 이번 하우스 아카이브 ''탐험의 집'' 주제로 참가합니다.', 'https://instagram.com/sharon_loves_bigmac', '/booths/house-archive/H05.webp'),
  ('T01', '생일의 장면을 식기로 담아내는 세라믹 브랜드.', 'https://instagram.com/boxgirl.studio', '/booths/house-archive/T01.webp'),
  ('T02', '시간을 수놓은 빈티지 취향의 패브릭 브랜드.', 'https://instagram.com/ourhourourhour', '/booths/house-archive/T02.webp'),
  ('T03', '일상의 감도를 채우는 프리미엄 디시 케어 브랜드.', 'https://instagram.com/naroe.official', '/booths/house-archive/T03.webp'),
  ('T04', '세상에 하나뿐인, 손의 흔적을 담은 비정형 세라믹 오브제.', 'https://instagram.com/a_0.zip', '/booths/house-archive/T04.webp'),
  ('T05', '<액막이 붕어빵>을 비롯한 귀여운 빵을 굽는 도자기 베이커리.', 'https://instagram.com/seegoalsonyeo', '/booths/house-archive/T05.webp'),
  ('T06', '사소한 것들에 괜히 장난을 걸어보는 비주얼 프로덕션.', 'https://instagram.com/ctrl_a_visual', '/booths/house-archive/T06.webp'),
  ('T07', '부드러운 원단과 포근한 재료로 만든 귀여운 소품 브랜드.', 'https://instagram.com/e1e_studio', '/booths/house-archive/T07.webp'),
  ('T08', '아트 프린트, 패브릭, 키링 등 일상의 빛을 전하는 라이프 아트 브랜드.', 'https://instagram.com/karangkarang__', '/booths/house-archive/T08.webp'),
  ('T09', '미묘한 감정과 순간들을 담아낸 전 세계 100가지 단어 아카이브.', 'https://instagram.com/t4hm.turf', '/booths/house-archive/T09.webp'),
  ('T10', '일상을 기록하고 간직하기 위해 자연을 담아 만든 도구.', 'https://instagram.com/sopoiyagi', '/booths/house-archive/T10.webp'),
  ('T11', '오일 파스텔로 풍경을 담아내는 일러스트레이터 순심 작가의 1인 독립 출판사.', 'https://instagram.com/bysoonsim', '/booths/house-archive/T11.webp'),
  ('T12', '일상에 귀여움 한 조각을 더하는 3D프린팅 & 핸드메이드 굿즈 브랜드.', 'https://instagram.com/mmungjju', '/booths/house-archive/T12.webp'),
  ('T13', '고양이 두 마리와 함께 살며 ''고양이와 동그란 세상''을 그리는 일러스트레이터.', 'https://instagram.com/godongsang', '/booths/house-archive/T13.webp'),
  ('T14', '취향에 맞는 일러스트를 선택해 만드는 데스크테리어 제품.', 'https://instagram.com/cong_cafe', '/booths/house-archive/T14.webp'),
  ('T15', '40년 경력 디자이너 엄마와 따뜻한 감성을 사랑하는 딸이 운영하는 패브릭 공방.', 'https://instagram.com/hey.lazysoo', '/booths/house-archive/T15.webp'),
  ('T16', '바느질로 이어진 우리, 일상에 작은 즐거움을 더하는 패브릭 소품 브랜드.', 'https://instagram.com/sewing._.us', '/booths/house-archive/T16.webp'),
  ('T17', '그림으로 전하는 작은 웃음과 위로, 그리고 안부.', 'https://instagram.com/pil.hwa', '/booths/house-archive/T17.webp'),
  ('T18', '소소한 행복을 주는 음식과 자연을 담은 일러스트 브랜드.', 'https://instagram.com/nijiboku', '/booths/house-archive/T18.webp'),
  ('T19', '아름다운 자연에서 동화를 꿈꾸며 키덜트 문화를 추구하는 브랜드.', 'https://instagram.com/kiwoomaru', '/booths/house-archive/T19.webp'),
  ('T20', '''재즈 일력''과 작품집 <너의 집>을 통해 집과 일상의 가치를 전하는 브랜드.', 'https://instagram.com/studio_padonamu', '/booths/house-archive/T20.webp'),
  ('T21', '냉장고와 현관에 붙여 식재료와 일정을 관리하는 자석 플래너보드.', 'https://instagram.com/ssub.official', '/booths/house-archive/T21.webp'),
  ('T22', '마음속에 묻어둔 꿈을 시작할 수 있도록 용기와 응원을 전하는 디자인 오브제 브랜드.', 'https://instagram.com/likid_design', '/booths/house-archive/T22.webp'),
  ('T23', '워리스톤 키링, 그립톡, 티 코스터 등 수작업으로 만드는 귀여운 아이템.', 'https://instagram.com/ppi_kan', '/booths/house-archive/T23.webp'),
  ('T24', '세계적인 로스터리부터 국내의 보석 같은 원두까지 소개하는 스페셜티 커피 큐레이션.', 'https://instagram.com/hamsoosee_note', '/booths/house-archive/T24.webp'),
  ('T25', '귀여운 미니 식물과 희귀한 아프리카 식물로 돌보는 하루를 제안하는 브랜드.', 'https://instagram.com/billybeanmillim', '/booths/house-archive/T25.webp'),
  ('T26', '인도 빈티지 칸타 퀼트와 우드 블럭 염색 패브릭 등으로 만드는 핸드메이드 소품.', 'https://instagram.com/mal_in.ko', '/booths/house-archive/T26.webp')
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
  ('ha_h01', '모든 오래된 것들에 대한 애정을 바탕으로, 한 사람의 진심 어린 취향을 담아 고르고 모아온 빈티지 소품을 선보이는 편집숍입니다. 이번 하우스 아카이브 ''수집의 집''에서는 오랜 시간에 걸쳐 모아온 취향과 이야기가 담긴 공간을 선보입니다.', 'https://instagram.com/bigsleep_shop', '성산동 빈티지 쇼룸이 통째로 들어온 편집숍이야.'),
  ('ha_h02', '''정해진 형태나 의미에 얽매이지 않은 자유로운 표현''을 이름에 담은 작가로, 회화·도자·가구디자인·설치 등을 아우릅니다. 이번 하우스 아카이브 ''관계의 집''에서는 소브라메사(식탁 대화)에서 영감을 받아 식탁과 대화의 순간들을 그려내고, 직접 만든 식기·가구·오브제로 환대의 풍경을 확장합니다.', 'https://instagram.com/herncworkshop', '식탁 대화에서 영감받아 식기랑 가구를 직접 만드는 작가야.'),
  ('ha_h03', '5인조 음악·비주얼 크리에이티브 그룹으로, 1st LP 《Memory Overdrive》를 발표했습니다. ''창작의 집'' 주제로 기획존 콜라보 부스에 참가합니다.', 'https://instagram.com/azikazinmagicworld', '5인조 음악·비주얼 그룹이 여는 콜라보 부스야.'),
  ('ha_h04', '2005년부터 이어온 국내 대표 북스테이(Bookstay)로, 헤이리에 위치해 서재·아트스테이 프레농을 운영합니다. 이번 하우스 아카이브 ''쉼의 집'' 주제로 참가합니다.', 'https://instagram.com/motif.1', '2005년부터 이어온 헤이리 북스테이야.'),
  ('ha_h05', 'Sharon Kim, 부산·서울 기반 아티스트이자 포토그래퍼로 서핑·음악·사진 콘텐츠를 선보입니다. 이번 하우스 아카이브 ''탐험의 집'' 주제로 참가합니다.', 'https://instagram.com/sharon_loves_bigmac', '부산·서울 오가며 서핑이랑 사진을 찍는 아티스트야.'),
  ('ha_t01', '생일의 장면을 식기로 담아내는 세라믹 브랜드.', 'https://instagram.com/boxgirl.studio', '생일의 한 장면을 그릇에 담는 세라믹 브랜드야.'),
  ('ha_t02', '시간을 수놓은 빈티지 취향의 패브릭 브랜드.', 'https://instagram.com/ourhourourhour', '시간을 수놓는 빈티지 감성의 패브릭 브랜드야.'),
  ('ha_t03', '일상의 감도를 채우는 프리미엄 디시 케어 브랜드.', 'https://instagram.com/naroe.official', '일상의 감도를 채우는 디시 케어 브랜드야.'),
  ('ha_t04', '세상에 하나뿐인, 손의 흔적을 담은 비정형 세라믹 오브제.', 'https://instagram.com/a_0.zip', '손의 흔적을 그대로 살린 비정형 세라믹을 만들어.'),
  ('ha_t05', '<액막이 붕어빵>을 비롯한 귀여운 빵을 굽는 도자기 베이커리.', 'https://instagram.com/seegoalsonyeo', '액막이 붕어빵 같은 귀여운 빵을 굽는 도자기 베이커리야.'),
  ('ha_t06', '사소한 것들에 괜히 장난을 걸어보는 비주얼 프로덕션.', 'https://instagram.com/ctrl_a_visual', '사소한 것들에 장난을 걸어보는 비주얼 프로덕션이야.'),
  ('ha_t07', '부드러운 원단과 포근한 재료로 만든 귀여운 소품 브랜드.', 'https://instagram.com/e1e_studio', '부드러운 원단으로 포근한 소품을 만들어.'),
  ('ha_t08', '아트 프린트, 패브릭, 키링 등 일상의 빛을 전하는 라이프 아트 브랜드.', 'https://instagram.com/karangkarang__', '아트 프린트랑 키링으로 일상에 빛을 더하는 브랜드야.'),
  ('ha_t09', '미묘한 감정과 순간들을 담아낸 전 세계 100가지 단어 아카이브.', 'https://instagram.com/t4hm.turf', '전 세계 100가지 단어를 감정으로 옮겨 담은 아카이브야.'),
  ('ha_t10', '일상을 기록하고 간직하기 위해 자연을 담아 만든 도구.', 'https://instagram.com/sopoiyagi', '자연을 담아 일상을 기록하는 도구를 만들어.'),
  ('ha_t11', '오일 파스텔로 풍경을 담아내는 일러스트레이터 순심 작가의 1인 독립 출판사.', 'https://instagram.com/bysoonsim', '오일 파스텔로 풍경을 그리는 일러스트레이터의 1인 출판사야.'),
  ('ha_t12', '일상에 귀여움 한 조각을 더하는 3D프린팅 & 핸드메이드 굿즈 브랜드.', 'https://instagram.com/mmungjju', '3D프린팅과 손끝으로 귀여움을 더하는 굿즈 브랜드야.'),
  ('ha_t13', '고양이 두 마리와 함께 살며 ''고양이와 동그란 세상''을 그리는 일러스트레이터.', 'https://instagram.com/godongsang', '고양이 두 마리와 사는 일상을 그리는 일러스트레이터야.'),
  ('ha_t14', '취향에 맞는 일러스트를 선택해 만드는 데스크테리어 제품.', 'https://instagram.com/cong_cafe', '취향대로 고르는 일러스트 데스크테리어야.'),
  ('ha_t15', '40년 경력 디자이너 엄마와 따뜻한 감성을 사랑하는 딸이 운영하는 패브릭 공방.', 'https://instagram.com/hey.lazysoo', '40년 경력 디자이너 엄마랑 딸이 함께 하는 패브릭 공방이야.'),
  ('ha_t16', '바느질로 이어진 우리, 일상에 작은 즐거움을 더하는 패브릭 소품 브랜드.', 'https://instagram.com/sewing._.us', '바느질로 일상에 즐거움을 더하는 패브릭 브랜드야.'),
  ('ha_t17', '그림으로 전하는 작은 웃음과 위로, 그리고 안부.', 'https://instagram.com/pil.hwa', '그림 한 장으로 웃음이랑 안부를 전해.'),
  ('ha_t18', '소소한 행복을 주는 음식과 자연을 담은 일러스트 브랜드.', 'https://instagram.com/nijiboku', '소소한 행복을 담은 음식·자연 일러스트 브랜드야.'),
  ('ha_t19', '아름다운 자연에서 동화를 꿈꾸며 키덜트 문화를 추구하는 브랜드.', 'https://instagram.com/kiwoomaru', '동화 같은 자연을 꿈꾸는 키덜트 브랜드야.'),
  ('ha_t20', '''재즈 일력''과 작품집 <너의 집>을 통해 집과 일상의 가치를 전하는 브랜드.', 'https://instagram.com/studio_padonamu', '''재즈 일력''으로 집과 일상의 가치를 전하는 브랜드야.'),
  ('ha_t21', '냉장고와 현관에 붙여 식재료와 일정을 관리하는 자석 플래너보드.', 'https://instagram.com/ssub.official', '냉장고에 붙여 식재료랑 일정을 관리하는 자석 플래너보드야.'),
  ('ha_t22', '마음속에 묻어둔 꿈을 시작할 수 있도록 용기와 응원을 전하는 디자인 오브제 브랜드.', 'https://instagram.com/likid_design', '묻어둔 꿈을 꺼내보게 응원하는 디자인 오브제 브랜드야.'),
  ('ha_t23', '워리스톤 키링, 그립톡, 티 코스터 등 수작업으로 만드는 귀여운 아이템.', 'https://instagram.com/ppi_kan', '키링, 그립톡 같은 걸 손으로 만드는 브랜드야.'),
  ('ha_t24', '세계적인 로스터리부터 국내의 보석 같은 원두까지 소개하는 스페셜티 커피 큐레이션.', 'https://instagram.com/hamsoosee_note', '세계 로스터리 원두를 소개하는 스페셜티 커피 큐레이션이야.'),
  ('ha_t25', '귀여운 미니 식물과 희귀한 아프리카 식물로 돌보는 하루를 제안하는 브랜드.', 'https://instagram.com/billybeanmillim', '미니 식물이랑 희귀 아프리카 식물을 돌보는 브랜드야.'),
  ('ha_t26', '인도 빈티지 칸타 퀼트와 우드 블럭 염색 패브릭 등으로 만드는 핸드메이드 소품.', 'https://instagram.com/mal_in.ko', '인도 빈티지 칸타 퀼트로 손수 만든 소품을 팔아.')
  ) as v(booth_id, summary, source_url, roam_interpretation)
 where exists (select 1 from booth b where b.id = v.booth_id)
on conflict (booth_id) do update set
  summary             = excluded.summary,
  source_url          = excluded.source_url,
  roam_interpretation = excluded.roam_interpretation,
  updated_at          = now();

-- 확인용:
--   select count(*) from booth where exhibition_id='exh_house_archive_2026' and logo_url is not null;   -- 99 (68+31)
--   select count(*) from booth_enrichment where booth_id like 'ha_%' and roam_interpretation is not null; -- 99
