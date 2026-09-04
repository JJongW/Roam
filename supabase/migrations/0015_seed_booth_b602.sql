-- 0015_seed_booth_b602.sql
-- B602(문학동네) 부스가 6/22 seed.sql 생성 이후 floorplan에 추가됐으나
-- gen-seed.mjs가 깨져 재생성되지 않아 hosted DB에 누락됨. 멱등 insert로 보강.
-- (seed.ts/floorplan-sibf.json과 parity; 같은 행이 재생성 seed.sql에도 존재.)

insert into booth (
  id, exhibition_id, hall_id, category_id, code, kind, name, company, aliases,
  description, long_description, images, logo_url, instagram_url, website_url,
  tags, x, y, popularity, created_at
) values
  ('b_b602', 'exh_sibf_2026', 'hall_b', 'cat_lit', 'B602', 'exhibitor', '문학동네', '문학', '["나무의마음"]'::jsonb, '문학동네 · 부스 B602', '문학동네의 부스입니다. 부스 번호 B602. 분야: 문학. 현장에서 신간 전시와 굿즈, 사인회를 만나볼 수 있어요. 2026 서울국제도서전 참가사입니다.', '[]'::jsonb, null, null, 'https://www.munhak.com/', '["lit"]'::jsonb, 2600, 1450, 50, '2026-01-05T00:00:00.000Z')
on conflict (id) do nothing;
