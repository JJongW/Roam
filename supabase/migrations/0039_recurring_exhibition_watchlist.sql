-- Recurring exhibition brands Roam should monitor for future COEX / COEX Magok
-- coverage. These are not concrete exhibition runs; once a run is confirmed,
-- it can become a row in the existing exhibition table.

create table if not exists recurring_exhibition_watchlist (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null,
  primary_venue text not null check (
    primary_venue in ('coex-samseong', 'coex-magok', 'multi')
  ),
  venues jsonb not null default '[]'::jsonb,
  recurrence text not null default '정기 개최',
  audience_floor int not null default 10000,
  last_verified_attendance int,
  attendance_year int,
  attendance_note text not null default '',
  confidence text not null check (
    confidence in ('confirmed', 'included_by_scale')
  ),
  tracking_status text not null default 'active' check (
    tracking_status in ('active', 'paused', 'archived')
  ),
  source_urls jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_exhibition_watchlist_status
  on recurring_exhibition_watchlist (tracking_status, primary_venue, category);

alter table recurring_exhibition_watchlist enable row level security;

drop policy if exists "public read recurring exhibition watchlist"
  on recurring_exhibition_watchlist;
create policy "public read recurring exhibition watchlist"
  on recurring_exhibition_watchlist for select using (true);

insert into recurring_exhibition_watchlist (
  id,
  slug,
  name,
  category,
  primary_venue,
  venues,
  recurrence,
  last_verified_attendance,
  attendance_year,
  attendance_note,
  confidence,
  source_urls,
  notes
) values
  ('rew_sibf', 'seoul-international-book-fair', '서울국제도서전', '도서', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 150000, 2025, '2025년 15만 명 이상 방문.', 'confirmed', '["https://www.coex.co.kr/coex-40th-anniversary-history/"]'::jsonb, '국내 최대급 도서전. Roam의 기존 SIBF 운영 데이터와 연결 우선.'),
  ('rew_seoul_cafe_show', 'seoul-cafe-show', '서울카페쇼', '카페/F&B', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 127745, 2025, '2025년 약 12.8만~15만 명 보도.', 'confirmed', '["https://www.coex.co.kr/exhibitions/%EC%A0%9C24%ED%9A%8C-%EC%84%9C%EC%9A%B8%EC%B9%B4%ED%8E%98%EC%87%BC/","https://economist.co.kr/article/view/ecn202512020058"]'::jsonb, '카페·커피 업계 대형 B2B/B2C 행사.'),
  ('rew_seoul_living_design_fair', 'seoul-living-design-fair', '서울리빙디자인페어', '리빙/디자인', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 100000, 2024, '2024년 약 10만 명.', 'confirmed', '["https://www.thereport.co.kr/news/articleView.html?idxno=47125","https://business.coex.co.kr/post-exhibitions/%EC%84%9C%EC%9A%B8%EB%A6%AC%EB%B9%99%EB%94%94%EC%9E%90%EC%9D%B8%ED%8E%98%EC%96%B4/"]'::jsonb, '마곡 파생 행사와 별도로 삼성 코엑스 본행사를 추적.'),
  ('rew_kiaf_seoul', 'kiaf-seoul', 'Kiaf SEOUL 한국국제아트페어', '아트', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 82000, 2025, '2025년 약 8.2만 명.', 'confirmed', '["https://www.newsis.com/view/?id=NISX20250907_0003319078","https://www.coex.co.kr/exhibitions/kiaf-seoul-2025-%ED%95%9C%EA%B5%AD%EA%B5%AD%EC%A0%9C%EC%95%84%ED%8A%B8%ED%8E%98%EC%96%B4/"]'::jsonb, '아트페어 성격상 VIP/프리뷰/일반 관람 동선 구분 필요.'),
  ('rew_food_week_korea', 'food-week-korea', '푸드위크 코리아 / 서울국제식품산업전', '식품', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 52754, 2025, '2025년 52,754명.', 'confirmed', '["https://www.foodweek.co.kr/last-exhibition?hl=ko","https://business.coex.co.kr/coex-40th-anniversary-history/"]'::jsonb, '식품 B2B/B2C 혼합 전시.'),
  ('rew_education_korea', 'education-korea', '대한민국 교육박람회', '교육', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 60302, 2026, '2026년 60,302명.', 'confirmed', '["https://www.educationkorea.kr/show-result"]'::jsonb, '교육기관·에듀테크·학부모 관람객이 섞이는 전시.'),
  ('rew_seoul_coffee_expo', 'seoul-coffee-expo', '서울커피엑스포', '커피', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 41443, 2026, '2026년 41,443명.', 'confirmed', '["https://coffeexpo2026.ems.coex.co.kr/history?hl=ko"]'::jsonb, '서울카페쇼와 별도 회차로 추적.'),
  ('rew_spoex', 'spoex', 'SPOEX 서울국제스포츠레저산업전', '스포츠/레저', 'coex-samseong', '["coex-samseong"]'::jsonb, '매년', 43602, 2025, '2025년 43,602명.', 'confirmed', '["https://www.spoex.com/main/intro/result","https://spobiz.kspo.or.kr/front/html/html.do?sitePage=supportInfoDetail01&tab=tab1&topMenuSeq=1"]'::jsonb, '스포츠·레저 장비 체험형 부스 가능성이 높음.'),
  ('rew_seoul_illustration_fair', 'seoul-illustration-fair', '서울일러스트레이션페어', '일러스트', 'coex-samseong', '["coex-samseong"]'::jsonb, '연 2회 성격', 70000, null, '매회 약 7만 명 규모로 소개.', 'confirmed', '["https://culture.seoul.go.kr/culture/culture/cultureEvent/view.do?cultcode=156193&menuNo=200008"]'::jsonb, '작가/브랜드 부스 밀도가 높아 개인 취향 추천과 잘 맞는 전시.'),
  ('rew_k_pet_fair_seoul', 'k-pet-fair-seoul', '케이펫페어 서울', '반려동물', 'coex-samseong', '["coex-samseong"]'::jsonb, '반복 개최', 21539, 2025, '2025년 21,539명.', 'confirmed', '["https://k-pet.co.kr/portfolio-items/25petco_report/"]'::jsonb, '동반/체험/구매 목적을 함께 보는 전시.'),
  ('rew_befe_baby_fair', 'befe-baby-fair', '베페 베이비페어', '베이비', 'multi', '["coex-samseong","coex-magok"]'::jsonb, '정기 개최', 50000, null, '공식 소개 기준 매회 약 5만 명 이상 규모.', 'confirmed', '["https://www.magok.befe.co.kr/exhibition"]'::jsonb, '삼성 코엑스와 코엑스마곡 양쪽 회차를 모두 추적.'),
  ('rew_cobe_baby_fair', 'cobe-baby-fair', '코베 베이비페어', '베이비', 'coex-samseong', '["coex-samseong"]'::jsonb, '정기 개최', null, 2026, '회차별 수치는 약하지만 대형 베이비페어로 포함 결정.', 'included_by_scale', '["https://www.cobe.co.kr/"]'::jsonb, '사용자 결정으로 추적 목록에 포함. 회차별 참관객 수는 다음 조사 때 보강.'),
  ('rew_seoul_early_childhood_education_fair', 'seoul-early-childhood-education-kids-fair', '서울국제유아교육전&키즈페어, 유교전', '유아/키즈', 'coex-samseong', '["coex-samseong"]'::jsonb, '정기 개최', null, 2026, '코엑스 A홀 대형 전시, 약 500부스 규모로 포함 결정.', 'included_by_scale', '["https://akei.or.kr/bbs/board.php?bo_table=schedule&page=6&wr_id=104002","https://segefairsglobal.com/home"]'::jsonb, '사용자 결정으로 추적 목록에 포함. 방문객 수 공개 근거는 다음 조사 때 보강.'),
  ('rew_magok_living_design_fair', 'magok-living-design-fair', '마곡리빙디자인페어 / 서울리빙디자인페어 in 마곡', '리빙/디자인', 'coex-magok', '["coex-magok"]'::jsonb, '2024 첫 개최 후 반복', 43000, 2024, '2024년 약 43,000명.', 'confirmed', '["https://www.segyebiz.com/newsView/20241202508603","https://m.ekn.kr/view.php?key=20250911025256005","https://business.coex.co.kr/"]'::jsonb, '코엑스마곡 대표 리빙 전시로 별도 추적.'),
  ('rew_k_pet_fair_magok', 'k-pet-fair-magok', '케이펫페어 마곡', '반려동물', 'coex-magok', '["coex-magok"]'::jsonb, '반복 개최', 12967, 2025, '2025년 12,967명.', 'confirmed', '["https://k-pet.co.kr/portfolio-items/25petm_report/","https://k-pet.co.kr/information/exhibition-scheduled-all/26pet_magok/"]'::jsonb, '마곡 회차는 서울 코엑스 회차와 별도 운영 데이터로 추적.')
on conflict (id) do update set
  slug = excluded.slug,
  name = excluded.name,
  category = excluded.category,
  primary_venue = excluded.primary_venue,
  venues = excluded.venues,
  recurrence = excluded.recurrence,
  last_verified_attendance = excluded.last_verified_attendance,
  attendance_year = excluded.attendance_year,
  attendance_note = excluded.attendance_note,
  confidence = excluded.confidence,
  source_urls = excluded.source_urls,
  notes = excluded.notes,
  updated_at = now();
