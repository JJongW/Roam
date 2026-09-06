-- 0050: enrichment_candidate — 검수 대기 초안.
--
-- 왜: 자동 초안(enrichment-drafter)이 만든 글이 검수 없이 booth_enrichment로
-- 들어가면 안 된다. 로미가 하는 말은 사용자가 부스를 고르는 근거라서, 지어낸 문장
-- 하나가 "빈말 금지" 원칙을 통째로 무너뜨린다(CLAUDE.md 근거 카드 규약).
--
-- 그래서 초안은 여기 pending으로 떨어지고, 사람이 보고 승인해야 반영된다. 반영
-- 자체는 기존 upsertBoothEnrichment를 그대로 타므로 change_log(0049)에 "무엇을
-- 어떻게 고쳤는지"가 남는다 — 그게 루프 A의 연료다.
--
-- ⚠️ 입력구를 초안에 한정하지 않는다. source가 text인 것도 같은 이유 —
-- 참가사 셀프 폼·주최 측 제출도 같은 큐를 타야 검수 화면이 하나로 유지된다
-- (docs/admin-automation-architecture.md §5 "같은 큐의 또 다른 입력구").

create table if not exists enrichment_candidate (
  id            text primary key,
  booth_id      text not null references booth(id) on delete cascade,
  exhibition_id text not null references exhibition(id) on delete cascade,
  -- drafter | participant | organizer | ...
  source        text not null,
  -- 저작 6종(+해석·출처) 초안. booth_enrichment와 같은 모양.
  payload       jsonb not null,
  -- generateGrounded가 준 출처 URL들. 검수자가 근거를 눌러볼 수 있어야 한다.
  sources       jsonb not null default '[]'::jsonb,
  -- quality-gate 점수 0..1 (결정론). 자동승인 임계값의 기준이 된다.
  confidence    numeric not null default 0,
  -- quality-gate가 잡은 문제들. 비어 있으면 통과.
  issues        jsonb not null default '[]'::jsonb,
  -- pending | approved | rejected | superseded
  status        text not null default 'pending',
  -- 검수 결과가 난 시점·사람.
  reviewed_at   timestamptz,
  reviewed_by   text,
  created_at    timestamptz not null default now()
);

-- 큐 화면의 주 질의: 전시별 pending을 신뢰도 높은 순으로.
create index if not exists enrichment_candidate_queue_idx
  on enrichment_candidate (exhibition_id, status, confidence desc);
-- 부스 하나의 초안 이력.
create index if not exists enrichment_candidate_booth_idx
  on enrichment_candidate (booth_id, created_at desc);

comment on table enrichment_candidate is
  '검수 대기 초안. 자동 초안·참가사 폼·주최 측 제출이 모두 여기로 들어와 같은 큐를 탄다.';
