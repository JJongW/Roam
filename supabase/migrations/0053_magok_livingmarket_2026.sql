-- 2026 마곡리빙마켓 — **전시 한 행만** 만든다.
--
-- 홀·분야·부스는 여기서 만들지 않는다. 그건 인입(intake.v1)이 한다:
-- data/intake/magok-livingmarket-2026.json을 /admin/intake에 올리면 홀 1개,
-- 분야 4개(+Special), 부스 142개가 들어간다. 전시별로 손으로 쓴 UPSERT
-- 마이그레이션은 더 만들지 않기로 했고(CLAUDE.md), 이 파일은 인입이 붙을
-- 자리(exhibition_id)를 만드는 최소한이다.
--
-- 좌표는 여기에도 인입 파일에도 없다 — FLOORPLANS['magok-livingmarket-2026']이
-- 부스 code로 대준다. map_width/map_height는 그 도면의 크기다.
insert into exhibition (
  id, slug, name, venue, description, start_date, end_date,
  cover_image_url, map_image_url, map_width, map_height, tips, created_at
) values (
  'exh_magok_livingmarket_2026',
  'magok-livingmarket-2026',
  '2026 마곡리빙마켓',
  '코엑스 마곡 컨벤션센터 1층',
  '리빙·푸드·공예 브랜드 138곳이 모이는 마곡리빙마켓. Home & Deco, Food & Taste, Space & Style, Hobby & Play 네 구역으로 나뉘고, 공식 부스배치도를 그대로 옮겨 실제 위치로 안내합니다.',
  '2026-09-10',
  '2026-09-13',
  null,
  null,
  2320,
  1540,
  '{"transportation": "지하철 5호선 발산역·9호선 마곡나루역에서 도보. 코엑스 마곡 컨벤션센터 1층입니다.", "parking": "건물 주차장 이용. 대중교통을 권장합니다.", "ticket": "현장 무료 입장.", "guide": "9/10(목)·9/11(금) 10:30–19:00, 9/12(토)·9/13(일) 10:30–18:00. 서측으로 들어가 동측으로 나가고, 가운데 가든라운지에서 쉴 수 있습니다."}'::jsonb,
  now()
)
on conflict (id) do update set
  slug        = excluded.slug,
  name        = excluded.name,
  venue       = excluded.venue,
  description = excluded.description,
  start_date  = excluded.start_date,
  end_date    = excluded.end_date,
  map_width   = excluded.map_width,
  map_height  = excluded.map_height,
  tips        = excluded.tips;
