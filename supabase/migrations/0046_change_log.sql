-- 0046: 변경 이력 원장(change_log).
--
-- 왜: 2026-09-06에 인입으로 운영 부스 59곳의 저작 정보를 덮어썼는데 **그 기록이
-- 어디에도 남지 않았다.** 누가·언제·무엇을 무엇으로 바꿨는지 알 방법이 없고,
-- 되돌리려면 사람이 손으로 뜬 백업 파일이 유일한 수단이었다.
--
-- 그리고 이건 루프 A(승인 학습)의 연료이기도 하다. 승인/반려만 기록하면 한 비트만
-- 남지만 **무엇을 어떻게 고쳤는지**를 남기면 필드별 정확도·few-shot 승격·필드별
-- 자동승인 임계값이 전부 여기서 파생된다(docs/admin-automation-architecture.md §7).
--
-- ⚠️ 엔티티에 묶지 않는다. 지금 급한 건 booth_enrichment지만 인입은 부스 본체
-- (name·description·images)도 바꾸고, 앞으로 전시·이벤트·LLM 초안도 같은 원장이
-- 필요하다. entity를 text로 두면 새 대상은 코드에서 문자열 하나 늘리면 된다.
-- source도 같은 이유로 enum이 아니라 text다 — drafter·참가사 폼이 생겨도
-- 마이그레이션이 필요 없다.
--
-- entity_id에 FK를 걸지 않는 것도 의도다. 대상 테이블이 여러 개라 걸 수 없고,
-- 원본이 지워져도 "무엇이 있었는지"는 남아야 한다.

create table if not exists change_log (
  id          text primary key,
  entity      text not null,
  entity_id   text not null,
  -- 조회를 좁히는 축. 부스면 그 전시 id. 없으면 null.
  scope_id    text,
  source      text not null,
  -- app_user.id. 조직자 코드 게이트로 들어온 admin은 null일 수 있다.
  actor       text,
  -- { 필드명: { before, after } } — 바뀐 필드만.
  field_diffs jsonb not null default '{}'::jsonb,
  reason      text,
  created_at  timestamptz not null default now()
);

create index if not exists change_log_entity_idx
  on change_log (entity, entity_id, created_at desc);
create index if not exists change_log_scope_idx
  on change_log (scope_id, created_at desc);
create index if not exists change_log_recent_idx
  on change_log (created_at desc);

comment on table change_log is
  '변경 이력 원장. 무엇을 무엇으로 바꿨는지(field_diffs)까지 남긴다 — 되돌리기의 근거이자 루프 A의 연료.';

-- 확인용:
--   select entity, source, count(*) from change_log group by 1,2 order by 3 desc;
