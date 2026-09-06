-- 0027_house_archive_2026.sql
-- 세 번째 전시 하우스 아카이브(HOUSE ARCHIVE) 운영 DB 반영
-- (docs/superpowers/plans/2026-07-29-house-archive-2026.md).
-- 부스 지오메트리는 코드의 FLOORPLANS(floorplan-house-archive.json)가 이기므로
-- 여기서는 넣지 않는다 — 이 마이그레이션은 전시 1 · 홀 1 · 카테고리 6 · 부스 104만
-- 반영한다. id는 src/lib/mock/seed-house-archive.ts와 동일하게 고정해 mock과
-- 운영이 같은 키를 쓰게 한다. 멱등 — 여러 번 실행해도 같은 결과.

-- 전체를 한 트랜잭션으로 묶는다. 아래 가드가 raise하면 뒤 statement가 아예 안
-- 돈다. 이 wrapper가 없으면 psql -f(ON_ERROR_STOP 미설정)로 돌릴 때 가드가
-- 실패해도 뒤 statement들이 그대로 실행돼 가드가 무력해진다.
begin;

-- house-archive-2026 slug가 exh_house_archive_2026이 아닌 다른 id로 이미
-- 존재하면(예: 과거에 다른 id로 수동 삽입됐다면) 아래 exhibition insert는
-- on conflict(id)가 못 잡아 slug 중복 행이 하나 더 생긴다 — 미리 끊는다.
do $$
begin
  if (select count(*) from exhibition where slug = 'house-archive-2026' and id <> 'exh_house_archive_2026') > 0 then
    raise exception '0027: exhibition.slug = house-archive-2026 이 exh_house_archive_2026 이 아닌 다른 id로 이미 존재한다 — 중단';
  end if;
end $$;

-- 컬럼 타입 가드. booth.images·booth.tags·exhibition.tips는 **전부 jsonb**다
-- (운영에서 확인). 읽기 매퍼의 strArr()은 Array.isArray()만 보기 때문에 jsonb
-- 배열과 text[]를 구분하지 못한다 — 코드만 봐선 타입을 알 수 없어 실제 스키마가
-- 진실이다. 타입이 다르면 Postgres가 "column is of type X but expression is of
-- type Y"라는 암호 같은 에러를 내므로, 먼저 실제 타입을 읽어 한국어로 알려주고 끊는다.
do $$
declare
  t_images text;
  t_tags   text;
  t_tips   text;
begin
  select udt_name into t_images from information_schema.columns
   where table_name = 'booth' and column_name = 'images';
  select udt_name into t_tags from information_schema.columns
   where table_name = 'booth' and column_name = 'tags';
  select udt_name into t_tips from information_schema.columns
   where table_name = 'exhibition' and column_name = 'tips';

  if t_images is null or t_tags is null or t_tips is null then
    raise exception '0027: booth.images / booth.tags / exhibition.tips 중 없는 컬럼이 있다 — 스키마 확인 필요';
  end if;
  if t_images <> 'jsonb' then
    raise exception
      '0027: booth.images가 jsonb가 아니라 %다 — 부스 104행의 images 값 캐스트를 일괄 치환해야 한다',
      t_images;
  end if;
  if t_tags <> 'jsonb' then
    raise exception
      '0027: booth.tags가 jsonb가 아니라 %다 — 부스 104행의 tags 값 캐스트를 일괄 치환해야 한다',
      t_tags;
  end if;
  if t_tips <> 'jsonb' then
    raise exception
      '0027: exhibition.tips가 jsonb가 아니라 %다 — INSERT의 tips 캐스트를 바꿔야 한다',
      t_tips;
  end if;
end $$;

-- 1) 전시. mapExhibition(src/lib/supabase/repository.ts ~190행) 컬럼과 1:1.
--    tips는 jsonb, seed-house-archive.ts의 ExhibitionTips 4개 키 그대로.
--    organizer_id는 넣지 않는다(NULL). Exhibition.organizerId는 타입상 optional
--    (types/index.ts:74)이고 mapExhibition이 통과시키기만 할 뿐 앱 어디서도 쓰지
--    않으며, organizer 테이블을 조회하는 코드도 없다. 운영에 org_house_archive
--    행이 없어서, 컬럼 구성을 모르는 채로 organizer 행을 만들어 넣느니 NULL로 둔다.
--    (mock seed의 organizerId "org_house_archive"와 어긋나지만 읽는 곳이 없어 무해.)
insert into exhibition (
  id, slug, name, venue, description, start_date, end_date,
  cover_image_url, map_image_url, map_width, map_height, tips,
  created_at
) values (
  'exh_house_archive_2026',
  'house-archive-2026',
  '하우스 아카이브: 홈 디깅 페어',
  '코엑스 더 플라츠 2층 (COEX The Platz)',
  '‘집’을 다섯 개의 방식으로 파고드는 홈 디깅 페어. 수집·관계·창작·쉼·탐험 다섯 테마의 집에 브랜드 부스와 테이블 마켓이 들어섭니다. 공식 부스배치도를 그대로 옮겨 실제 위치로 안내합니다.',
  '2026-08-13',
  '2026-08-16',
  null,
  null,
  2614,
  1128,
  '{"transportation":"지하철 2호선 삼성역·9호선 봉은사역에서 코엑스 연결. 더 플라츠는 코엑스 2층입니다.","parking":"코엑스 지하주차장 이용. 대중교통을 권장합니다.","ticket":"온라인 예매 및 현장 구매.","guide":"다섯 테마의 집을 따라 브랜드를 둘러보고, 테이블 마켓에서 작은 물건을 만나보세요."}'::jsonb,
  '2026-07-29T00:00:00.000Z'::timestamptz
)
on conflict (id) do update set
  slug              = excluded.slug,
  name              = excluded.name,
  venue             = excluded.venue,
  description       = excluded.description,
  start_date        = excluded.start_date,
  end_date          = excluded.end_date,
  map_width         = excluded.map_width,
  map_height        = excluded.map_height,
  tips              = excluded.tips;

-- 2) 홀. mapHall(~200행). 이 전시엔 더 플라츠 단일 홀뿐.
insert into hall (id, exhibition_id, name, floor, sort)
values ('hall_ha', 'exh_house_archive_2026', '더 플라츠', 2, 0)
on conflict (id) do update set
  exhibition_id = excluded.exhibition_id,
  name          = excluded.name,
  floor         = excluded.floor,
  sort          = excluded.sort;

-- 3) 카테고리 6개. mapCategory(~210행). category 테이블은 전역(전시별 컬럼
--    없음) — repository.ts의 getExhibition은 이 전시 부스가 실제 쓰는 카테고리만
--    골라 노출하므로(다른 전시 카테고리가 새지 않도록) id 충돌만 피하면 된다.
--    id·slug·name·color·icon은 seed-house-archive.ts haCategories와 글자 그대로.
insert into category (id, slug, name, color, icon) values
  ('cat_ha_collect', 'collect', '수집의 집', '#e879c4', 'Archive'),
  ('cat_ha_gather',  'gather',  '관계의 집', '#eab308', 'Users'),
  ('cat_ha_make',    'make',    '창작의 집', '#a8a29e', 'Hammer'),
  ('cat_ha_rest',    'rest',    '쉼의 집',   '#84cc16', 'Moon'),
  ('cat_ha_explore', 'explore', '탐험의 집', '#f97316', 'Compass'),
  ('cat_ha_table',   'table',   '테이블 마켓', '#64748b', 'Store')
on conflict (id) do update set
  slug  = excluded.slug,
  name  = excluded.name,
  color = excluded.color,
  icon  = excluded.icon;

-- 4) 부스 104개. mapBooth/BOOTH_LIST_COLS(~225~254행) 컬럼과 1:1
--    (aliases·logo_url·instagram_url·website_url은 seed가 전부 undefined라
--    생략 — 컬럼 기본값 null이 mapBooth의 "null이면 undefined" 처리와 맞는다).
--    exhibition_id·hall_id는 하드코딩하지 않고 위에서 넣은 행을 slug/이름으로
--    다시 조회해 채운다 — insert 순서가 바뀌거나 재실행돼도 항상 실제 존재하는
--    부모 행을 가리키게 하기 위해서다. hall은 이 전시에 유일해 cross join해도
--    행이 늘지 않는다(exhibition 1 x hall 1 x booth 104 = 104).
--    id·category_id·code·kind·name·company·description·long_description·
--    tags·x·y는 seed-house-archive.ts의 haBooths 파생 규칙
--    (id=`ha_${code.toLowerCase().replace(/-/g,'_')}`, company=카테고리명,
--    description/long_description 템플릿, tags=[카테고리 slug](+'기획존' if H*))
--    그대로 생성한 값 — floorplan-house-archive.json에서 스크립트로 뽑았다.
insert into booth (
  id, exhibition_id, hall_id, category_id, code, kind, name, company,
  description, long_description, images, tags, x, y, popularity, created_at
)
select v.id, e.id, h.id, v.category_id, v.code, v.kind, v.name, v.company,
       v.description, v.long_description, v.images, v.tags, v.x, v.y, v.popularity, v.created_at
from exhibition e
cross join hall h
cross join (values
  ('ha_ctr_collect', 'cat_ha_collect', 'CTR-COLLECT', 'facility', '수집의 집 센터', '수집의 집', '수집의 집 센터 · 부스 CTR-COLLECT', '수집의 집 센터(COLLECT HOUSE CENTER)의 부스입니다. 부스 번호 CTR-COLLECT. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 728, 188, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_ctr_gather', 'cat_ha_gather', 'CTR-GATHER', 'facility', '관계의 집 센터', '관계의 집', '관계의 집 센터 · 부스 CTR-GATHER', '관계의 집 센터(GATHER HOUSE CENTER)의 부스입니다. 부스 번호 CTR-GATHER. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 600, 765, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_ctr_make', 'cat_ha_make', 'CTR-MAKE', 'facility', '창작의 집 센터', '창작의 집', '창작의 집 센터 · 부스 CTR-MAKE', '창작의 집 센터(MAKE HOUSE CENTER)의 부스입니다. 부스 번호 CTR-MAKE. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1934, 223, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_ctr_explore', 'cat_ha_explore', 'CTR-EXPLORE', 'facility', '탐험의 집 센터', '탐험의 집', '탐험의 집 센터 · 부스 CTR-EXPLORE', '탐험의 집 센터(EXPLORE HOUSE CENTER)의 부스입니다. 부스 번호 CTR-EXPLORE. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1873, 763, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_ctr_rest', 'cat_ha_rest', 'CTR-REST', 'facility', '쉼의 집 센터', '쉼의 집', '쉼의 집 센터 · 부스 CTR-REST', '쉼의 집 센터(REST HOUSE CENTER)의 부스입니다. 부스 번호 CTR-REST. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2532, 697, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_h01', 'cat_ha_collect', 'H01', 'exhibitor', '수집의 집 X 빅슬립', '수집의 집', '수집의 집 X 빅슬립 · 부스 H01', '수집의 집 X 빅슬립(COLLECT HOUSE X BIG SLEEP)의 부스입니다. 부스 번호 H01. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect", "기획존"]'::jsonb, 20, 218, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_h02', 'cat_ha_gather', 'H02', 'exhibitor', '관계의 집 X 헤르시', '관계의 집', '관계의 집 X 헤르시 · 부스 H02', '관계의 집 X 헤르시(GATHER HOUSE X HERNC)의 부스입니다. 부스 번호 H02. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather", "기획존"]'::jsonb, 49, 480, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_h03', 'cat_ha_make', 'H03', 'exhibitor', '창작의 집 X 아지카진 매직월드', '창작의 집', '창작의 집 X 아지카진 매직월드 · 부스 H03', '창작의 집 X 아지카진 매직월드(MAKE HOUSE X AZIKAZIN MAGIC WORLD)의 부스입니다. 부스 번호 H03. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make", "기획존"]'::jsonb, 89, 20, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_h04', 'cat_ha_rest', 'H04', 'exhibitor', '쉼의 집 X 모티프원', '쉼의 집', '쉼의 집 X 모티프원 · 부스 H04', '쉼의 집 X 모티프원(REST HOUSE X MOTIF1)의 부스입니다. 부스 번호 H04. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest", "기획존"]'::jsonb, 395, 152, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_h05', 'cat_ha_explore', 'H05', 'exhibitor', '탐험의 집 X 샤론', '탐험의 집', '탐험의 집 X 샤론 · 부스 H05', '탐험의 집 X 샤론(EXPLORE HOUSE X SHARON)의 부스입니다. 부스 번호 H05. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore", "기획존"]'::jsonb, 429, 493, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c13', 'cat_ha_collect', 'C13', 'exhibitor', '비온뒤', '수집의 집', '비온뒤 · 부스 C13', '비온뒤(Be on D)의 부스입니다. 부스 번호 C13. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 710, 24, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c14', 'cat_ha_collect', 'C14', 'exhibitor', '누땡스', '수집의 집', '누땡스 · 부스 C14', '누땡스(nu thanks)의 부스입니다. 부스 번호 C14. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 906, 23, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c15', 'cat_ha_collect', 'C15', 'exhibitor', '터틀넥프레스', '수집의 집', '터틀넥프레스 · 부스 C15', '터틀넥프레스(TURTLENECK PRESS)의 부스입니다. 부스 번호 C15. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 1004, 23, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c12', 'cat_ha_collect', 'C12', 'exhibitor', '무니버니', '수집의 집', '무니버니 · 부스 C12', '무니버니(MOONYBUNNY)의 부스입니다. 부스 번호 C12. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 799, 190, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c11', 'cat_ha_collect', 'C11', 'exhibitor', '퀘스처너스', '수집의 집', '퀘스처너스 · 부스 C11', '퀘스처너스(QUESTIONERS)의 부스입니다. 부스 번호 C11. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 897, 190, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c10', 'cat_ha_collect', 'C10', 'exhibitor', '사유', '수집의 집', '사유 · 부스 C10', '사유(SAYOO)의 부스입니다. 부스 번호 C10. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 997, 190, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c09', 'cat_ha_collect', 'C09', 'exhibitor', '오브코흐', '수집의 집', '오브코흐 · 부스 C09', '오브코흐(OFCOH)의 부스입니다. 부스 번호 C09. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 1093, 188, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c08', 'cat_ha_collect', 'C08', 'exhibitor', '꼬모다미', '수집의 집', '꼬모다미 · 부스 C08', '꼬모다미(COMMODAMI)의 부스입니다. 부스 번호 C08. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 1192, 190, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c07', 'cat_ha_collect', 'C07', 'exhibitor', '쑤파클링레모네이드', '수집의 집', '쑤파클링레모네이드 · 부스 C07', '쑤파클링레모네이드(Sooparkling Lemonade)의 부스입니다. 부스 번호 C07. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 1291, 190, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c06', 'cat_ha_collect', 'C06', 'exhibitor', '오티에이치콤마', '수집의 집', '오티에이치콤마 · 부스 C06', '오티에이치콤마(Oth,)의 부스입니다. 부스 번호 C06. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 1291, 290, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c03', 'cat_ha_collect', 'C03', 'exhibitor', '라이프앤콜렉트', '수집의 집', '라이프앤콜렉트 · 부스 C03', '라이프앤콜렉트(Life&COLLECT)의 부스입니다. 부스 번호 C03. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 799, 318, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c04', 'cat_ha_collect', 'C04', 'exhibitor', '플로피', '수집의 집', '플로피 · 부스 C04', '플로피(FLOPY)의 부스입니다. 부스 번호 C04. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 994, 318, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c05', 'cat_ha_collect', 'C05', 'exhibitor', '도넛바이닐샵', '수집의 집', '도넛바이닐샵 · 부스 C05', '도넛바이닐샵(DONUTVINYLSHOP)의 부스입니다. 부스 번호 C05. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 1188, 318, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c01', 'cat_ha_collect', 'C01', 'exhibitor', '루이스폴센', '수집의 집', '루이스폴센 · 부스 C01', '루이스폴센(Louis Poulsen)의 부스입니다. 부스 번호 C01. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 775, 479, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_c02', 'cat_ha_collect', 'C02', 'exhibitor', '더퍼블리셔', '수집의 집', '더퍼블리셔 · 부스 C02', '더퍼블리셔(THE PUBLISHER)의 부스입니다. 부스 번호 C02. 하우스 아카이브 수집의 집 참가 브랜드입니다.', '[]'::jsonb, '["collect"]'::jsonb, 1076, 479, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g01', 'cat_ha_gather', 'G01', 'exhibitor', '라이프집 스토어', '관계의 집', '라이프집 스토어 · 부스 G01', '라이프집 스토어(Lifezip Store)의 부스입니다. 부스 번호 G01. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 775, 550, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g02', 'cat_ha_gather', 'G02', 'exhibitor', '소로이샵', '관계의 집', '소로이샵 · 부스 G02', '소로이샵(soroishop)의 부스입니다. 부스 번호 G02. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 775, 741, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g07', 'cat_ha_gather', 'G07', 'exhibitor', '얄라', '관계의 집', '얄라 · 부스 G07', '얄라(yalla)의 부스입니다. 부스 번호 G07. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 902, 550, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g06', 'cat_ha_gather', 'G06', 'exhibitor', '봄마음', '관계의 집', '봄마음 · 부스 G06', '봄마음(Bommaum)의 부스입니다. 부스 번호 G06. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 902, 741, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g05', 'cat_ha_gather', 'G05', 'exhibitor', '메이크어포터리', '관계의 집', '메이크어포터리 · 부스 G05', '메이크어포터리(make.a.pottery)의 부스입니다. 부스 번호 G05. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 902, 837, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g08', 'cat_ha_gather', 'G08', 'exhibitor', '메멜트', '관계의 집', '메멜트 · 부스 G08', '메멜트(MEMELT)의 부스입니다. 부스 번호 G08. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 1076, 550, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g09', 'cat_ha_gather', 'G09', 'exhibitor', '키들', '관계의 집', '키들 · 부스 G09', '키들(KEEDLE)의 부스입니다. 부스 번호 G09. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 1076, 645, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g10', 'cat_ha_gather', 'G10', 'exhibitor', '솥밭', '관계의 집', '솥밭 · 부스 G10', '솥밭(sotbat)의 부스입니다. 부스 번호 G10. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 1076, 741, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g11', 'cat_ha_gather', 'G11', 'exhibitor', '토마로우', '관계의 집', '토마로우 · 부스 G11', '토마로우(Tomarrow)의 부스입니다. 부스 번호 G11. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 1076, 837, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g13', 'cat_ha_gather', 'G13', 'exhibitor', '엠더블유엠', '관계의 집', '엠더블유엠 · 부스 G13', '엠더블유엠(mwm)의 부스입니다. 부스 번호 G13. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 1242, 550, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g14', 'cat_ha_gather', 'G14', 'exhibitor', '맹그로브 부동산', '관계의 집', '맹그로브 부동산 · 부스 G14', '맹그로브 부동산(mangrove)의 부스입니다. 부스 번호 G14. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 1242, 832, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g03', 'cat_ha_gather', 'G03', 'exhibitor', '커먼즈', '관계의 집', '커먼즈 · 부스 G03', '커먼즈(COMMONS)의 부스입니다. 부스 번호 G03. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 708, 1020, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g04', 'cat_ha_gather', 'G04', 'exhibitor', '오파츠걸즈', '관계의 집', '오파츠걸즈 · 부스 G04', '오파츠걸즈(OOPARTSgirls)의 부스입니다. 부스 번호 G04. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 904, 1020, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_g12', 'cat_ha_gather', 'G12', 'exhibitor', '스밋', '관계의 집', '스밋 · 부스 G12', '스밋(SMIT)의 부스입니다. 부스 번호 G12. 하우스 아카이브 관계의 집 참가 브랜드입니다.', '[]'::jsonb, '["gather"]'::jsonb, 1100, 1020, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m01', 'cat_ha_make', 'M01', 'exhibitor', '한국파이롯트', '창작의 집', '한국파이롯트 · 부스 M01', '한국파이롯트(KOREA PILOT)의 부스입니다. 부스 번호 M01. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1547, 226, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m02', 'cat_ha_make', 'M02', 'exhibitor', '슌', '창작의 집', '슌 · 부스 M02', '슌(SHUN)의 부스입니다. 부스 번호 M02. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1547, 418, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m03', 'cat_ha_make', 'M03', 'exhibitor', '누아&누키트', '창작의 집', '누아&누키트 · 부스 M03', '누아&누키트(NUA&Nukit)의 부스입니다. 부스 번호 M03. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1547, 510, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m04', 'cat_ha_make', 'M04', 'exhibitor', '아지카진 매직월드', '창작의 집', '아지카진 매직월드 · 부스 M04', '아지카진 매직월드(Azikazin Magic World)의 부스입니다. 부스 번호 M04. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1547, 606, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m05', 'cat_ha_make', 'M05', 'exhibitor', '데이오프프로젝트', '창작의 집', '데이오프프로젝트 · 부스 M05', '데이오프프로젝트(Day-Off-Project)의 부스입니다. 부스 번호 M05. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1655, 604, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m06', 'cat_ha_make', 'M06', 'exhibitor', '습작실 by 커버서울', '창작의 집', '습작실 by 커버서울 · 부스 M06', '습작실 by 커버서울(COVERSEOUL)의 부스입니다. 부스 번호 M06. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1773, 509, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m07', 'cat_ha_make', 'M07', 'exhibitor', '낼나', '창작의 집', '낼나 · 부스 M07', '낼나(NELNA)의 부스입니다. 부스 번호 M07. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1773, 225, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m08', 'cat_ha_make', 'M08', 'exhibitor', '팩앤폴드', '창작의 집', '팩앤폴드 · 부스 M08', '팩앤폴드(Pack n Fold)의 부스입니다. 부스 번호 M08. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1933, 422, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m09', 'cat_ha_make', 'M09', 'exhibitor', '페블온', '창작의 집', '페블온 · 부스 M09', '페블온(pebble on)의 부스입니다. 부스 번호 M09. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 1935, 604, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m13', 'cat_ha_make', 'M13', 'exhibitor', '까요미스튜디오', '창작의 집', '까요미스튜디오 · 부스 M13', '까요미스튜디오(KKAYOMI STUDIO)의 부스입니다. 부스 번호 M13. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 2055, 223, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m12', 'cat_ha_make', 'M12', 'exhibitor', '페페하우스', '창작의 집', '페페하우스 · 부스 M12', '페페하우스(FEFEHAUS)의 부스입니다. 부스 번호 M12. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 2055, 319, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m11', 'cat_ha_make', 'M11', 'exhibitor', '희다가든', '창작의 집', '희다가든 · 부스 M11', '희다가든(Heedagarden)의 부스입니다. 부스 번호 M11. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 2055, 415, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_m10', 'cat_ha_make', 'M10', 'exhibitor', '단단라이프', '창작의 집', '단단라이프 · 부스 M10', '단단라이프(dandanlife)의 부스입니다. 부스 번호 M10. 하우스 아카이브 창작의 집 참가 브랜드입니다.', '[]'::jsonb, '["make"]'::jsonb, 2055, 510, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r01', 'cat_ha_rest', 'R01', 'exhibitor', '복복복', '쉼의 집', '복복복 · 부스 R01', '복복복(BokBokBok)의 부스입니다. 부스 번호 R01. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2222, 225, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r02', 'cat_ha_rest', 'R02', 'exhibitor', '밑미', '쉼의 집', '밑미 · 부스 R02', '밑미(meet me)의 부스입니다. 부스 번호 R02. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2222, 320, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r03', 'cat_ha_rest', 'R03', 'exhibitor', '카인드오브썸머', '쉼의 집', '카인드오브썸머 · 부스 R03', '카인드오브썸머(KIND OF SUMMER)의 부스입니다. 부스 번호 R03. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2222, 416, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r04', 'cat_ha_rest', 'R04', 'exhibitor', '네츄럴굿띵스', '쉼의 집', '네츄럴굿띵스 · 부스 R04', '네츄럴굿띵스(NGT)의 부스입니다. 부스 번호 R04. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2222, 511, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r05', 'cat_ha_rest', 'R05', 'exhibitor', '옥산백', '쉼의 집', '옥산백 · 부스 R05', '옥산백(OKSAN100)의 부스입니다. 부스 번호 R05. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2222, 604, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r06', 'cat_ha_rest', 'R06', 'exhibitor', '리재', '쉼의 집', '리재 · 부스 R06', '리재(REJE)의 부스입니다. 부스 번호 R06. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2324, 604, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r07', 'cat_ha_rest', 'R07', 'exhibitor', '물 수', '쉼의 집', '물 수 · 부스 R07', '물 수(MOOLSOO)의 부스입니다. 부스 번호 R07. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2353, 511, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r08', 'cat_ha_rest', 'R08', 'exhibitor', '부부티', '쉼의 집', '부부티 · 부스 R08', '부부티(BUBUTI)의 부스입니다. 부스 번호 R08. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2354, 415, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r09', 'cat_ha_rest', 'R09', 'exhibitor', '해비터스', '쉼의 집', '해비터스 · 부스 R09', '해비터스(Habit-Us)의 부스입니다. 부스 번호 R09. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2355, 225, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r10', 'cat_ha_rest', 'R10', 'exhibitor', '산새', '쉼의 집', '산새 · 부스 R10', '산새(sansae)의 부스입니다. 부스 번호 R10. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2531, 124, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r11', 'cat_ha_rest', 'R11', 'exhibitor', '수푸이', '쉼의 집', '수푸이 · 부스 R11', '수푸이(SOOPUI)의 부스입니다. 부스 번호 R11. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2531, 315, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r12', 'cat_ha_rest', 'R12', 'exhibitor', '탈로리피', '쉼의 집', '탈로리피 · 부스 R12', '탈로리피(TALO RYYPPY)의 부스입니다. 부스 번호 R12. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2532, 506, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_r13', 'cat_ha_rest', 'R13', 'exhibitor', '뷰릿', '쉼의 집', '뷰릿 · 부스 R13', '뷰릿(beaurit)의 부스입니다. 부스 번호 R13. 하우스 아카이브 쉼의 집 참가 브랜드입니다.', '[]'::jsonb, '["rest"]'::jsonb, 2532, 890, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e01', 'cat_ha_explore', 'E01', 'exhibitor', '선데이플래닛47 X 레어로우', '탐험의 집', '선데이플래닛47 X 레어로우 · 부스 E01', '선데이플래닛47 X 레어로우(SUNDAYPLANET47 X RARERAW)의 부스입니다. 부스 번호 E01. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1546, 763, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e08', 'cat_ha_explore', 'E08', 'exhibitor', 'LG 티운', '탐험의 집', 'LG 티운 · 부스 E08', 'LG 티운(LG tiiun)의 부스입니다. 부스 번호 E08. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1678, 763, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e07', 'cat_ha_explore', 'E07', 'exhibitor', '아소브네', '탐험의 집', '아소브네 · 부스 E07', '아소브네(Asobne)의 부스입니다. 부스 번호 E07. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1777, 763, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e06', 'cat_ha_explore', 'E06', 'exhibitor', '엠크라프트', '탐험의 집', '엠크라프트 · 부스 E06', '엠크라프트(m craft)의 부스입니다. 부스 번호 E06. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 2071, 763, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e11', 'cat_ha_explore', 'E11', 'exhibitor', '아세도라', '탐험의 집', '아세도라 · 부스 E11', '아세도라(HACEDORA)의 부스입니다. 부스 번호 E11. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 2221, 766, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e12', 'cat_ha_explore', 'E12', 'exhibitor', '리베이퍼', '탐험의 집', '리베이퍼 · 부스 E12', '리베이퍼(REVAPOR)의 부스입니다. 부스 번호 E12. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 2356, 763, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e13', 'cat_ha_explore', 'E13', 'exhibitor', '코코라커', '탐험의 집', '코코라커 · 부스 E13', '코코라커(COCO LOCKER)의 부스입니다. 부스 번호 E13. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 2356, 859, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e02', 'cat_ha_explore', 'E02', 'exhibitor', '담초', '탐험의 집', '담초 · 부스 E02', '담초(DAMCHO)의 부스입니다. 부스 번호 E02. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1678, 891, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e03', 'cat_ha_explore', 'E03', 'exhibitor', '나무아일랜드', '탐험의 집', '나무아일랜드 · 부스 E03', '나무아일랜드(NAMU ISLAND)의 부스입니다. 부스 번호 E03. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1777, 891, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e04', 'cat_ha_explore', 'E04', 'exhibitor', '플레인가든', '탐험의 집', '플레인가든 · 부스 E04', '플레인가든(PLEINE)의 부스입니다. 부스 번호 E04. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1875, 890, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e05', 'cat_ha_explore', 'E05', 'exhibitor', '스테이로스트', '탐험의 집', '스테이로스트 · 부스 E05', '스테이로스트(STAY LOST)의 부스입니다. 부스 번호 E05. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1972, 890, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e09', 'cat_ha_explore', 'E09', 'exhibitor', '포티', '탐험의 집', '포티 · 부스 E09', '포티(4t)의 부스입니다. 부스 번호 E09. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1703, 1037, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_e10', 'cat_ha_explore', 'E10', 'exhibitor', '로우리트 콜렉티브', '탐험의 집', '로우리트 콜렉티브 · 부스 E10', '로우리트 콜렉티브(Lowlit Collective)의 부스입니다. 부스 번호 E10. 하우스 아카이브 탐험의 집 참가 브랜드입니다.', '[]'::jsonb, '["explore"]'::jsonb, 1895, 1037, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t07', 'cat_ha_table', 'T07', 'exhibitor', 'E1E_studio', '테이블 마켓', 'E1E_studio · 부스 T07', 'E1E_studio(E1E_studio)의 부스입니다. 부스 번호 T07. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1191, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t08', 'cat_ha_table', 'T08', 'exhibitor', '카랑카랑', '테이블 마켓', '카랑카랑 · 부스 T08', '카랑카랑(KARANGKARANG)의 부스입니다. 부스 번호 T08. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1260, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t09', 'cat_ha_table', 'T09', 'exhibitor', '단어의 시각적 번역', '테이블 마켓', '단어의 시각적 번역 · 부스 T09', '단어의 시각적 번역(Graphic Translation of Words)의 부스입니다. 부스 번호 T09. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1329, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t10', 'cat_ha_table', 'T10', 'exhibitor', '소포', '테이블 마켓', '소포 · 부스 T10', '소포(sopo)의 부스입니다. 부스 번호 T10. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1525, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t11', 'cat_ha_table', 'T11', 'exhibitor', '블루토마토즈', '테이블 마켓', '블루토마토즈 · 부스 T11', '블루토마토즈(bluetomatoes)의 부스입니다. 부스 번호 T11. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1595, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t12', 'cat_ha_table', 'T12', 'exhibitor', '멍주', '테이블 마켓', '멍주 · 부스 T12', '멍주(mungju)의 부스입니다. 부스 번호 T12. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1664, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t13', 'cat_ha_table', 'T13', 'exhibitor', '고동상', '테이블 마켓', '고동상 · 부스 T13', '고동상(godongsang)의 부스입니다. 부스 번호 T13. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1892, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t14', 'cat_ha_table', 'T14', 'exhibitor', '나꽁아꽁', '테이블 마켓', '나꽁아꽁 · 부스 T14', '나꽁아꽁(Nakkong Akkong)의 부스입니다. 부스 번호 T14. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 1961, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t15', 'cat_ha_table', 'T15', 'exhibitor', '레이지 수', '테이블 마켓', '레이지 수 · 부스 T15', '레이지 수(Lazy SOO)의 부스입니다. 부스 번호 T15. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2031, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t16', 'cat_ha_table', 'T16', 'exhibitor', '쏘잉어스', '테이블 마켓', '쏘잉어스 · 부스 T16', '쏘잉어스(Sewingus)의 부스입니다. 부스 번호 T16. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2100, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t17', 'cat_ha_table', 'T17', 'exhibitor', '필화', '테이블 마켓', '필화 · 부스 T17', '필화(Pil Hwa)의 부스입니다. 부스 번호 T17. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2168, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t18', 'cat_ha_table', 'T18', 'exhibitor', '니지', '테이블 마켓', '니지 · 부스 T18', '니지(NIJI)의 부스입니다. 부스 번호 T18. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2237, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t19', 'cat_ha_table', 'T19', 'exhibitor', '키우마루', '테이블 마켓', '키우마루 · 부스 T19', '키우마루(kiwoomaru.com)의 부스입니다. 부스 번호 T19. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2306, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t20', 'cat_ha_table', 'T20', 'exhibitor', '스튜디오 파도나무', '테이블 마켓', '스튜디오 파도나무 · 부스 T20', '스튜디오 파도나무(studio PadoNamu)의 부스입니다. 부스 번호 T20. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2376, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t21', 'cat_ha_table', 'T21', 'exhibitor', '계획을 썹포트', '테이블 마켓', '계획을 썹포트 · 부스 T21', '계획을 썹포트(ssub)의 부스입니다. 부스 번호 T21. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2445, 65, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t06', 'cat_ha_table', 'T06', 'exhibitor', '컨트롤에이', '테이블 마켓', '컨트롤에이 · 부스 T06', '컨트롤에이(Ctrl A)의 부스입니다. 부스 번호 T06. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 612, 118, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t05', 'cat_ha_table', 'T05', 'exhibitor', '시시콜콜한 잡화점', '테이블 마켓', '시시콜콜한 잡화점 · 부스 T05', '시시콜콜한 잡화점(seeseecallcall GIFT SHOP)의 부스입니다. 부스 번호 T05. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 612, 188, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t04', 'cat_ha_table', 'T04', 'exhibitor', '안 안', '테이블 마켓', '안 안 · 부스 T04', '안 안(Ahn Ahn)의 부스입니다. 부스 번호 T04. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 612, 257, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t03', 'cat_ha_table', 'T03', 'exhibitor', '나로에', '테이블 마켓', '나로에 · 부스 T03', '나로에(NAROÉ)의 부스입니다. 부스 번호 T03. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 612, 326, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t02', 'cat_ha_table', 'T02', 'exhibitor', '아워아워', '테이블 마켓', '아워아워 · 부스 T02', '아워아워(ourhour)의 부스입니다. 부스 번호 T02. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 612, 524, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t01', 'cat_ha_table', 'T01', 'exhibitor', '박스걸스튜디오', '테이블 마켓', '박스걸스튜디오 · 부스 T01', '박스걸스튜디오(BOXGIRL STUDIO)의 부스입니다. 부스 번호 T01. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 612, 594, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t22', 'cat_ha_table', 'T22', 'exhibitor', '라이키드', '테이블 마켓', '라이키드 · 부스 T22', '라이키드(LIKID)의 부스입니다. 부스 번호 T22. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2129, 1083, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t23', 'cat_ha_table', 'T23', 'exhibitor', '삐칸', '테이블 마켓', '삐칸 · 부스 T23', '삐칸(PPiKAN)의 부스입니다. 부스 번호 T23. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2199, 1083, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t24', 'cat_ha_table', 'T24', 'exhibitor', '컬렉티브 아카이브', '테이블 마켓', '컬렉티브 아카이브 · 부스 T24', '컬렉티브 아카이브(Collective Archive)의 부스입니다. 부스 번호 T24. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2268, 1083, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t25', 'cat_ha_table', 'T25', 'exhibitor', '빌리빈밀림', '테이블 마켓', '빌리빈밀림 · 부스 T25', '빌리빈밀림(BILLYBEANMILLIM)의 부스입니다. 부스 번호 T25. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2337, 1083, 50, '2026-07-29T00:00:00.000Z'::timestamptz),
  ('ha_t26', 'cat_ha_table', 'T26', 'exhibitor', '말린', '테이블 마켓', '말린 · 부스 T26', '말린(MALIN)의 부스입니다. 부스 번호 T26. 하우스 아카이브 테이블 마켓 참가 브랜드입니다.', '[]'::jsonb, '["table"]'::jsonb, 2451, 1083, 50, '2026-07-29T00:00:00.000Z'::timestamptz)
) as v(id, category_id, code, kind, name, company, description, long_description, images, tags, x, y, popularity, created_at)
where e.slug = 'house-archive-2026'
  and h.exhibition_id = e.id
on conflict (id) do update set
  category_id       = excluded.category_id,
  code              = excluded.code,
  kind              = excluded.kind,
  name              = excluded.name,
  company           = excluded.company,
  description       = excluded.description,
  long_description  = excluded.long_description,
  images            = excluded.images,
  tags              = excluded.tags,
  x                 = excluded.x,
  y                 = excluded.y,
  popularity        = excluded.popularity;

commit;
