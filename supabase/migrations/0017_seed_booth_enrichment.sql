-- 부스 enrichment(굿즈·테마·요약·팁) 주입. SIBF 인스타 수동 정리분 19개 부스.
-- enrichment-sibf-2026.json과 패리티. 멱등(upsert).
insert into booth_enrichment (booth_id, goods_keywords, theme_tags, summary, tips, source_url) values
  ('b_a105', '["에코백"]'::jsonb, '[]'::jsonb, '단추 10주년 기념 에코백과 굿즈를 선보이는 부스', '10주년 에코백 매일 40개 한정 판매, 일찍 방문 추천. 도서 구매 시 책 3권 증정 이벤트', 'https://instagram.com/danchu_press'),
  ('b_a1304', '["캠프캡"]'::jsonb, '[]'::jsonb, '인기 캠프캡 새 디자인과 초대권 이벤트', '작년 품절된 캠프캡, 일찍 방문 추천. 초대권 이벤트(1인 1매)', 'https://instagram.com/guulpress'),
  ('b_a1406', '["굴레 키링","소이 캔들","필사 노트","납작 연필","냥엽서"]'::jsonb, '[]'::jsonb, '키링·소이캔들·필사노트 등 다양한 굿즈', '도서 구매 시 종이백, 현장 이벤트 참여 시 우표 스티커 증정', 'https://instagram.com/dongyeon_press'),
  ('b_a1905', '["꼬블이 부채","꼬블이 책갈피","꼬블이 카드","블라인드북"]'::jsonb, '["lit"]'::jsonb, '꼬블이 굿즈와 스탬프 이벤트, 사인회 진행', '5만원 이상 구매 시 꼬블이 카드 증정, 스탬프 이벤트, 사인회는 선착순', 'https://instagram.com/dulnyouk_pub'),
  ('b_a2003', '[]'::jsonb, '[]'::jsonb, '유익한 도서와 함께 굿즈를 준비한 부스', null, 'https://instagram.com/foxcorner15'),
  ('b_a2009', '["드립백"]'::jsonb, '[]'::jsonb, '방문객에게 드립백을 증정하는 부스', '방문 시 드립백 선물 증정', 'https://instagram.com/words.of.trees'),
  ('b_a209', '["에코백","엽서 세트"]'::jsonb, '[]'::jsonb, '페이퍼스토리·니케북스가 함께 쓰는 굿즈·사인회 부스', '김미라·이정은·이하영 작가 사인회, 인스타 인증 시 시집 증정', 'https://instagram.com/paperstory_book'),
  ('b_a305', '["키링","배지"]'::jsonb, '[]'::jsonb, '청아·봄마중 합동 부스, 키링 만들기와 배지 증정', '도서 2권 이상 구매 시 키링 만들기 체험, 특정 도서 구매 시 배지 증정', 'https://instagram.com/chunga_book'),
  ('b_a705', '["리유저블백"]'::jsonb, '["children"]'::jsonb, '고양이 리유저블백 증정과 박아림 작가 사인회', '도서 2권 이상 구매 시 리유저블백 증정, 박아림 작가 사인회', 'https://instagram.com/kookminbooks'),
  ('b_b104', '["리유저블백","타포린백","식빵 메모지","키캡 클리커"]'::jsonb, '["children"]'::jsonb, '리유저블백·메모지 굿즈와 전보라 작가 프로그램', '세트 구매 시 굿즈 증정, 전보라 작가와의 만남 프로그램', 'https://instagram.com/tokkiseom_book'),
  ('b_b109', '["책갈피","수첩"]'::jsonb, '[]'::jsonb, '탐조·창작 테마 굿즈와 휴식 공간이 있는 부스', '이벤트 참여만 해도 책갈피·수첩 증정, B홀 속 쉼터', 'https://instagram.com/cocoon_books'),
  ('b_b203', '["필사 노트"]'::jsonb, '["lit"]'::jsonb, '레모·스위밍꿀 공동 부스, 필사노트와 합동 사인회', '도서 구매 시 필사노트 증정, 김화진×정기현 합동 사인회 오전 10:30 번호표 배부', 'https://instagram.com/ed_lesmots'),
  ('b_b503', '[]'::jsonb, '[]'::jsonb, '롤러코스터·초록비책공방 공동 부스, 초대권 증정 이벤트', '도서전 초대권 증정 이벤트 진행', 'https://instagram.com/rollercoaster__press'),
  ('b_b504', '["스티커","미니북 키링","포스터","zine","책갈피","타포린백","말랑이","엽서 세트"]'::jsonb, '["art"]'::jsonb, '플랫폼P 공유부스, 여러 출판사의 책갈피·포스터·키링 굿즈', '출판사별 구매 특전(3만원 이상 중철노트 등)과 인벤토리 책갈피 만들기 워크숍·라이브드로잉 진행', null),
  ('b_a602', '["타포린백","미니 북라이트","헤어밴드","부직포백","달러구트 과자"]'::jsonb, '["lit"]'::jsonb, '『달러구트 꿈 백화점 0』 공개와 구매 금액별 증정', '1만·2만·5만원 이상 구매 시 단계별 굿즈, 인스타 인증 시 부직포백 증정', 'https://instagram.com/samnparkers'),
  ('b_a1101', '["캡슐 토이"]'::jsonb, '["lit"]'::jsonb, '세계문학전집·민음의 시 캡슐토이 굿즈', null, 'https://instagram.com/minumsa_books'),
  ('b_a1701', '["책갈피","티셔츠","노트커버","포스터","오브제"]'::jsonb, '["general"]'::jsonb, '교보문고 오리지널 책갈피·티셔츠 등 굿즈', '굿즈는 현장 판매만 진행, 가격은 현장 공개', 'https://instagram.com/kyobobook_online'),
  ('b_a1702', '["비즈 책갈피","에코백"]'::jsonb, '[]'::jsonb, '비즈 책갈피·에코백 등 10주년 굿즈', '링티·아로마티카 굿즈 매일 선착순 배부', 'https://instagram.com/millie_bookclub'),
  ('b_b304', '["에코백","키링","북클립","미니연필세트","티셔츠"]'::jsonb, '["humanities"]'::jsonb, '적독 키링·북클립·에코백 등 독서 굿즈', null, 'https://instagram.com/booksea_pub')
on conflict (booth_id) do update set
  goods_keywords = excluded.goods_keywords,
  theme_tags = excluded.theme_tags,
  summary = excluded.summary,
  tips = excluded.tips,
  source_url = excluded.source_url,
  updated_at = now();
