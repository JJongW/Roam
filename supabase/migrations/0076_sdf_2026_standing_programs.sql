-- 0076: 서울디자인페스티벌 2026(sdf-2026) 행사 내내 여는 특별전 3곳과 SDF SHOP(상시 4건).
-- 원천: 공식 리플렛 2쪽 "50년 특별전", "SDF 특별전", "SDF SHOP"(SDF2026-floorplan-20261123.pdf),
-- 참여 작가와 큐레이터는 공식 사이트 https://seoul.designfestival.co.kr/sdf/program/ (2026-11-24 받음).
-- 제목과 설명은 주최 원문 그대로다(브랜드 규칙 §1 예외). 기간은 행사 시간(11-26 10:30 ~ 11-29 17:00, 한국 시각)이다.
--
-- 0075와 따로 둔 이유: iOS "오늘 프로그램"(RomiAsk.todayPrograms)은 standing을 보지 않고 시작한 날만 고른다.
-- 이대로 넣으면 iOS에서 첫날(11-26)에만 "오전 10시 30분" 프로그램으로 보이고 27~29일엔 안 보인다.
-- iOS가 상시를 따로 다루기 전에 넣을지는 헤더와 Ted가 정한다(결정 기록 참고).
--
-- 앞선 조건, 다시 돌려도 같은 결과인 점, 적용 방법은 0075와 같다.

insert into event (id, booth_id, title, description, start_time, end_time, reward_info, capacity, tag, subtitle, speaker, standing)
select v.id, b.id, v.title, v.description, '2026-11-26T01:30:00.000Z'::timestamptz, '2026-11-29T08:00:00.000Z'::timestamptz,
       null, null, v.tag, null, v.speaker, true
from (values
  ('evs_sdf-2026_mak-poster', 'A-01',
   '디자인하우스 50년 특별전 〈막 포스터 프로젝트〉',
   '50인의 필자가 ‘막’에 관해 쓴 글을 50인의 디자이너에게 건넸고, 디자이너들은 각자의 포스터로 답했다. 글과 이미지 사이의 어긋남을 각자의 해석이 들어설 자리로 삼은 50개의 ‘막’이 한자리에 나란히 놓인다. 곡선형 파이프 구조물에 여러 단으로 걸린 포스터는 멀리서는 하나의 풍경으로, 가까이에서는 한 점 한 점의 작품으로 다가온다. 관람객은 정해진 순서 없이 포스터를 둘러보거나, 벤치에 앉아 전시를 바라볼 수 있다.',
   '50년 특별전', null),
  ('evs_sdf-2026_design-chronicle', 'A-03',
   '월간〈디자인〉 50년 특별전 〈디자인 크로니클〉',
   '창간 50주년을 맞은 월간〈디자인〉이 1976년부터 오늘까지 우리 일상의 풍경을 바꿔온 디자인을 연대기로 되짚는다. 김성곤 교수가 큐레이션한 마스터피스 실물이 당시 과월호 지면과 나란히 놓여 반세기의 기록을 지면 밖으로 꺼낸다.',
   '50년 특별전', '큐레이션 | 김성곤(서울시립대학교 교수)'),
  ('evs_sdf-2026_tteooreun', 'C-13',
   '떠오른 것들 + 浮地',
   '〈떠오른 것들 + 부지(浮地)〉는 겹겹이 놓인 석간주빛 원반 위로 공예와 디자인의 상상을 펼친다. 숯과 나무, 금속과 섬유, 자개와 옻칠은 저마다의 물성을 드러내며 익숙한 쓰임을 벗어난다. 축적된 기술과 자유로운 조형이 만나 하나의 새로운 풍경을 이룬다.',
   'SDF 특별전', '디렉터 | 석철목 / 참여작가 | 고도훈, 김병섭, 이강연, 이소명, 신하늬, happ studios, WKND LAB'),
  ('evs_sdf-2026_shop', 'A-02',
   'SDF SHOP',
   '디자인하우스 50년과 제25회 서울디자인페스티벌을 기념하는 공식 굿즈숍. SDF를 위해 참가 브랜드와 특별히 제작한 한정판 협업 굿즈를 선보인다. 전시장에서 발견한 디자인을 일상에서도 사용하고 소장할 수 있도록 다양한 오브제를 소개한다.',
   '공식 굿즈숍', null)
) as v(id, code, title, description, tag, speaker)
join exhibition e on e.slug = 'sdf-2026'
join booth b on b.exhibition_id = e.id and b.code = v.code
on conflict (id) do update set
  booth_id = excluded.booth_id,
  title = excluded.title,
  description = excluded.description,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  tag = excluded.tag,
  speaker = excluded.speaker,
  standing = excluded.standing;

-- 확인(읽기만): 4행, standing = true.
-- select ev.id, b.code, ev.title, ev.standing from event ev join booth b on b.id = ev.booth_id
--   join exhibition e on e.id = b.exhibition_id where e.slug = 'sdf-2026' and ev.standing order by b.code;
