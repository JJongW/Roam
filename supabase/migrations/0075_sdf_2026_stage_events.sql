-- 0075: 서울디자인페스티벌 2026(sdf-2026) SDF Stage(A-05) 무대 프로그램 3건.
-- 원천: 공식 리플렛 2쪽 "부대행사"(SDF2026-floorplan-20261123.pdf, 2026-11-23 받음).
-- 제목과 설명은 주최 원문 그대로다(브랜드 규칙 §1 예외, components/booth-v2/booth-extras.tsx 주석).
-- 시각은 한국 시각(+09:00)을 UTC로 적었다.
--
-- 앞선 조건: sdf-2026 부스가 운영에 올라가 있어야 한다(PR #227 머지, 배포, 런북 8단계 적용 뒤).
-- 부스를 (행사 slug, 부스 번호)로 찾아 붙이므로 부스가 없으면 0행이 들어가고 아무 일도 없다.
-- 다시 돌려도 같은 결과다(고정 id, on conflict update). 다른 행사의 이벤트는 건드리지 않는다.
-- 적용: Supabase SQL Editor(손). 결정 기록 docs/decisions/2026-11-24_서울디자인페스티벌-행사-프로그램.md.

insert into event (id, booth_id, title, description, start_time, end_time, reward_info, capacity, tag, subtitle, speaker, standing)
select v.id, b.id, v.title, v.description, v.start_time::timestamptz, v.end_time::timestamptz, null, null, v.tag, null, null, false
from (values
  ('evp_sdf-2026_opening', 'A-05',
   '오프닝 리셉션 & 코리아디자인어워드',
   '전시의 시작을 알리는 공식 오프닝 행사로, 주요 내빈과 참가 디자이너·브랜드 간의 네트워킹 리셉션이 진행된다. 이와 함께 월간〈디자인〉이 선정해 한 해 동안 주목할 만한 성과를 이룬 한국 디자인 프로젝트와 디자이너를 조명하는 공식 시상식이 열린다.',
   '2026-11-26T09:30:00.000Z', '2026-11-26T11:00:00.000Z', '부대행사'),
  ('evp_sdf-2026_flash-talk', 'A-05',
   '디자인 스페셜리스트 플래시 토크',
   '2026 디자인 스페셜리스트 특별전에 참여한 11팀이 무대에 올라 밀도 있는 프레젠테이션으로 각자의 포트폴리오와 지향점을 공유하며, 평소 접하기 어려웠던 디자이너들의 이야기를 직접 전한다.',
   '2026-11-27T06:00:00.000Z', '2026-11-27T07:50:00.000Z', '부대행사'),
  ('evp_sdf-2026_fast-forward', 'A-05',
   '패스트 포워드',
   '‘Fast Forward(빨리 감기)’를 비튼 제목으로, 과거를 통해 미래를 내다본다는 의미와 월간〈디자인〉의 긴 역사를 1시간 안에 압축해 다룬다는 중의적 해석을 담고 있다. 역대 편집장들이 한자리에 모여 매체의 과거·현재·미래를 조망하며, 이 밖에도 디자인의 성장을 지원하는 와디즈와 포니정 아카데미의 강연도 함께 준비되어 있다.',
   '2026-11-28T06:00:00.000Z', '2026-11-28T07:30:00.000Z', '부대행사')
) as v(id, code, title, description, start_time, end_time, tag)
join exhibition e on e.slug = 'sdf-2026'
join booth b on b.exhibition_id = e.id and b.code = v.code
on conflict (id) do update set
  booth_id = excluded.booth_id,
  title = excluded.title,
  description = excluded.description,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  tag = excluded.tag,
  standing = excluded.standing;

-- 확인(읽기만): 3행이 A-05에 붙어 있어야 한다.
-- select ev.id, b.code, ev.title, ev.start_time from event ev join booth b on b.id = ev.booth_id
--   join exhibition e on e.id = b.exhibition_id where e.slug = 'sdf-2026' order by ev.start_time;
