-- 0051: enrichment_candidate.review_note — 반려 사유.
--
-- 왜: 반려가 지금 학습이 안 되는 절반이다. 승인은 사람이 고친 diff가
-- change_log에 남아 루프 A의 연료가 되는데, 반려는 "별로였다"는 한 비트만 남고
-- **왜 별로였는지가 사라진다.** 설계 문서 §7이 경고한 바로 그 상태다.
--
-- 실질적 결과도 나쁘다: 반려해도 부스 필드는 여전히 비어 있어서 다음에 초안기를
-- 돌리면 그 부스가 또 대상이 되고, 지난 반려 사유를 모르니 비슷한 초안이 또 나온다.
-- 검수자는 같은 판단을 반복한다 — "거듭할수록 손이 덜 간다"의 정반대다.
--
-- 사유를 여기 남기고, 다음 초안이 그걸 읽어 프롬프트에 넣는다. 그 지점이 루프 A가
-- 실제로 도는 자리다.

alter table enrichment_candidate
  add column if not exists review_note text;

-- 다음 초안이 "이 부스에서 전에 왜 반려됐나"를 찾는 질의.
create index if not exists enrichment_candidate_rejected_idx
  on enrichment_candidate (booth_id, status, created_at desc)
  where status = 'rejected';

comment on column enrichment_candidate.review_note is
  '반려 사유(또는 승인 시 남긴 메모). 다음 초안의 프롬프트에 들어가 같은 실수를 반복하지 않게 한다.';
