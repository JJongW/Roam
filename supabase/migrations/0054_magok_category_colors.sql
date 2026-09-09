-- ---------------------------------------------------------------------------
-- 0054: 마곡리빙마켓 카테고리 색 — 주최 공식 도면 색을 그대로 쓴다.
--
-- 인입 틀(intake.v1)에는 색 필드가 없어서 카테고리가 기본값 #6b7280(회색)으로
-- 만들어졌다. 지도·칩·부스 상세가 전부 category.color를 읽으므로 다섯 구역이
-- 구분 없이 회색으로 보였다.
--
-- 값은 추측이 아니라 도면 이미지에서 픽셀을 뽑았다
-- (public/booths/living market/2026_makok_livingmarket_floor.png).
-- 현장 배너·안내도와 같은 색이어야 방문객이 "지도의 파랑 = 저기 파란 구역"으로
-- 읽는다 — 색을 우리 팔레트로 갈아치우면 그 연결이 끊긴다.
-- ---------------------------------------------------------------------------

update category c set color = v.color
from (values
  ('space-style',    '#E171A6'),  -- SPACE & STYLE (분홍)
  ('home-deco',      '#86D0E5'),  -- HOME & DECO (하늘)
  ('food-taste',     '#79AF8C'),  -- FOOD & TASTE (초록)
  ('hobby-kitchen',  '#ECA65C')   -- HOBBY & PLAY / KITCHEN & TABLEWARE (주황)
) as v(slug, color)
where c.slug = v.slug;
