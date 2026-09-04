-- 0021: booth_enrichment 근거 카드 필드 — 저작 관람 가치·해석·추천 근거·행동·타이밍·기억.
-- companion-reframe Phase F(근거 카드). 0013의 굿즈/요약/팁 위에 "왜 너에게 맞는지"를
-- 저작하는 필드를 추가한다. 전부 nullable/기본 빈 값이라 멱등. 값 형태는 BoothEnrichment
-- (src/lib/types/index.ts) 및 mock enrichment JSON과 동일.

alter table booth_enrichment
  add column if not exists value_tags jsonb not null default '[]'::jsonb,
  add column if not exists roam_interpretation text,
  add column if not exists recommendation_reasons jsonb not null default '{}'::jsonb,
  add column if not exists things_to_do jsonb not null default '[]'::jsonb,
  add column if not exists timing jsonb not null default '[]'::jsonb,
  add column if not exists memory_hooks jsonb not null default '[]'::jsonb,
  add column if not exists conversation_prompts jsonb not null default '[]'::jsonb,
  add column if not exists confidence text;