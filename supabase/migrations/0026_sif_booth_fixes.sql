-- 0026_sif_booth_fixes.sql
-- SIF 2026 도면 좌표 재생성(docs/superpowers/specs/2026-07-28-sif-floorplan-regeneration-design.md)
-- 에 따른 운영 DB 보정. 부스 지오메트리는 코드의 FLOORPLANS가 이기므로 여기 없다.
-- 멱등 — 여러 번 실행해도 같은 결과.

-- 전체를 한 트랜잭션으로 묶는다. 아래 가드가 raise하면 statement 1~3이 아예 안
-- 돈다. 이 wrapper가 없으면 psql -f(ON_ERROR_STOP 미설정)로 돌릴 때 가드가
-- 실패해도 뒤 statement들이 그대로 실행돼 가드가 무력해진다.
begin;

-- 이 마이그레이션은 손으로 한 번 실행하고 테스트도 없다. slug 조회가 0행이면
-- 각 statement가 조용히 no-op 되어 성공한 것처럼 보인다 — 특히 statement 1이
-- no-op되면 exhibition.map_width가 옛 값(2584)에 머물러 도면 오른쪽이 잘린 채로
-- "정상"처럼 렌더된다. category.slug가 중복돼도 statement 2의 UPDATE ... FROM이
-- 임의의 소스 행을 골라버릴 수 있으므로, "있는지"가 아니라 "정확히 하나인지"를 확인한다.
do $$
begin
  if (select count(*) from exhibition where slug = 'sif-2026') <> 1 then
    raise exception '0026: exhibition.slug = sif-2026 이 정확히 1건이 아니다 — 중단';
  end if;
  if (select count(*) from category where slug = 'intl-biz') <> 1 then
    raise exception '0026: category.slug = intl-biz 가 정확히 1건이 아니다 — 중단';
  end if;
  if (select count(*) from category where slug = 'intl-artist') <> 1 then
    raise exception '0026: category.slug = intl-artist 가 정확히 1건이 아니다 — 중단';
  end if;
end $$;

-- 컬럼 타입 가드. booth.images와 booth.tags는 **둘 다 jsonb**다(운영에서 확인).
-- 읽기 매퍼의 strArr()은 Array.isArray()만 보기 때문에 jsonb 배열과 text[]를
-- 구분하지 못한다 — 코드만 봐선 타입을 알 수 없어 실제 스키마가 진실이다.
-- 타입이 다르면 Postgres가 "column is of type X but expression is of type Y"라는
-- 암호 같은 에러를 내므로, 먼저 실제 타입을 읽어 한국어로 알려주고 끊는다.
do $$
declare
  t_images text;
  t_tags   text;
begin
  select udt_name into t_images from information_schema.columns
   where table_name = 'booth' and column_name = 'images';
  select udt_name into t_tags from information_schema.columns
   where table_name = 'booth' and column_name = 'tags';

  if t_images is null or t_tags is null then
    raise exception '0026: booth.images / booth.tags 컬럼을 찾을 수 없다 — 스키마 확인 필요';
  end if;
  if t_images <> 'jsonb' then
    raise exception
      '0026: booth.images가 jsonb가 아니라 %다 — INSERT의 images 값 캐스트를 그 타입에 맞게 바꿔야 한다',
      t_images;
  end if;
  if t_tags <> 'jsonb' then
    raise exception
      '0026: booth.tags가 jsonb가 아니라 %다 — tags 값 두 곳(INSERT, UPDATE)의 캐스트를 그 타입에 맞게 바꿔야 한다',
      t_tags;
  end if;
end $$;

-- 1) 캔버스 크기. map-view.tsx가 exhibition.map_width/height를 지도 뷰포트로 쓴다.
--    옛 2584x1506이면 도면 오른쪽(S·T·U·V 블록)이 잘린다.
update exhibition
set map_width = 3028,
    map_height = 1637
where slug = 'sif-2026';

-- 2) O08 (Illustration Taipei, 해외 기업) 추가. 공식 도면엔 있는데 참가자
--    목록 이관 때 누락됐다. DB에 행이 없으면 지도에 그려지지 않는다.
insert into booth (
  id, exhibition_id, hall_id, category_id, code, kind, name, company,
  description, long_description, images, tags, x, y, popularity, created_at
)
select
  'sif_o08',
  e.id,
  (select h.id from hall h where h.exhibition_id = e.id order by h.sort limit 1),
  c.id,
  'O08',
  'exhibitor',
  'Illustration Taipei',
  c.name,
  'Illustration Taipei · 부스 O08',
  'Illustration Taipei의 부스입니다. 부스 번호 O08. 2026 서울일러스트레이션페어 참가 해외 기업입니다.',
  '[]'::jsonb,
  '["intl-biz"]'::jsonb,
  1890,
  1147,
  50,
  '2026-01-05T00:00:00.000Z'::timestamptz
from exhibition e
cross join category c
where e.slug = 'sif-2026'
  and c.slug = 'intl-biz'
on conflict (id) do update set
  category_id = excluded.category_id,
  company     = excluded.company,
  tags        = excluded.tags,
  x           = excluded.x,
  y           = excluded.y;

-- 3) 카테고리 교정 3건. ocreo 도면은 해외작가(#DCDDFF)로 칠했는데 우리 데이터엔
--    국내작가로 들어가 있었다. tags는 read 시 valueTags 도출에 쓰이므로 함께 고친다.
--    long_description은 seed-sif.ts가 카테고리 한글명을 문구에 구워 넣은
--    비정규화 텍스트라(read 시 파생되는 valueTags와 다름) 템플릿을 그대로
--    재생성해 함께 고친다 — 안 고치면 "…참가 국내 작가입니다."가 company=
--    "해외 작가"와 모순된 채로 부스 상세에 남는다.
update booth b
set category_id      = c.id,
    company           = c.name,
    tags              = '["intl-artist"]'::jsonb,
    long_description  = b.name || '의 부스입니다. 부스 번호 ' || b.code
                         || '. 2026 서울일러스트레이션페어 참가 ' || c.name || '입니다.'
from category c, exhibition e
where c.slug = 'intl-artist'
  and e.slug = 'sif-2026'
  and b.exhibition_id = e.id
  and b.code in ('J42', 'J49', 'R14');

commit;
