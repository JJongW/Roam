-- 부스 반응 판정 — "로미의 예측을 사용자가 확인해줬는가"를 채점하기 위한 컬럼.
--
-- judged_class: 반응(또는 되묻기 답) 순간 그 부스가 사용자의 확신 가치와 겹쳤는지를
-- 얼린 값('confident'|'uncertain'). 자신 있다고 한 것만 틀렸을 때 벌점을 주기 위해
-- 판정 시점의 확신도를 보존해야 한다 — 나중에 브레인이 바뀐 뒤 지금 확신도로 과거
-- 반응을 되짚어 채점하면 그 시점엔 없던 지식으로 판정하는 셈이라 왜곡된다.
--
-- retro: '가봄'(visited) 자체는 호불호가 없는 사실 표시라 무판정이다. 나중에 지도
-- 시트나 관람 마치기에서 "여기 어땠어?"에 답하면 그 답이 여기 담긴다
-- ('liked'|'disliked'). 답하지 않으면 null — 채점 집계에서 제외된다.
--
-- 기존에 쌓인 반응(운영 booth_note)은 이 마이그레이션 이후에도 judged_class가
-- null이다 — 소급 채점하지 않는다(설계 문서 참고). 그 부스에 다시 반응해야
-- 채점 대상이 된다.
--
-- 상세: docs/superpowers/specs/2026-08-03-taste-accuracy-design.md

alter table booth_note
  add column if not exists judged_class text,
  add column if not exists retro text;

-- 확인용:
--   select judged_class, retro, count(*) from booth_note group by 1, 2;
