-- 0013: booth_enrichment — 수동 주입한 부스 추가정보(굿즈·테마·팁).
-- 인스타 자동 스크래핑이 아니라 운영자가 보고 옮겨 적은 값을 보관한다(docs/booth-enrichment.md).
-- themeTags(=카테고리 slug)는 seed 시 booth.tags에도 병합돼 추천 스코어링에 LLM 없이 반영된다.
-- 이 테이블은 굿즈/요약/팁/출처를 부스 상세에 노출하기 위한 보조 저장소다. 멱등.

create table if not exists booth_enrichment (
  booth_id       text primary key references booth(id) on delete cascade,
  goods_keywords jsonb not null default '[]'::jsonb,
  theme_tags     jsonb not null default '[]'::jsonb,
  summary        text,
  tips           text,
  source_url     text,
  updated_at     timestamptz not null default now()
);

alter table booth_enrichment enable row level security;

-- 공개 읽기(부스 상세에서 노출). 쓰기는 운영자(서비스 롤, RLS 우회) 또는 향후 관리 API.
drop policy if exists "public read booth_enrichment" on booth_enrichment;
create policy "public read booth_enrichment" on booth_enrichment for select using (true);
drop policy if exists "anon upsert booth_enrichment" on booth_enrichment;
create policy "anon upsert booth_enrichment" on booth_enrichment for insert with check (true);
drop policy if exists "anon update booth_enrichment" on booth_enrichment;
create policy "anon update booth_enrichment" on booth_enrichment for update using (true) with check (true);
