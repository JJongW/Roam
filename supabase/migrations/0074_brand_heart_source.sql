-- ---------------------------------------------------------------------------
-- 0074: brand_heart.source — 부스 하트가 따라 만든 브랜드 하트를 구분한다(UI 23, 2026-11-24 Ted 결정).
--
-- 왜: 부스 상세의 하트가 하나로 합쳐졌다. 부스에 하트를 남기면 그 부스의 브랜드에도 하트가 남고
-- (source='booth'), 부스 하트를 빼면 그 브랜드의 다른 부스 하트가 없을 때만 브랜드 하트도 뺀다.
-- 이때 사용자가 브랜드에 직접 남긴 하트(source='direct', 0068 이후 지금까지의 모든 줄)는 지우지 않는다.
-- 출처를 적어 두지 않으면 둘을 가를 수 없다.
--
-- 기존 줄은 전부 'direct'가 된다(UI 19 브랜드 줄 알약, 마이 브랜드 목록에서 사용자가 직접 남긴 것). 채우기(backfill) 불필요.
-- 직접 하트를 다시 남기면 'booth' 줄이 'direct'로 올라간다 — 그래서 자기 줄 update 정책을 더한다.
--
-- 적용 순서: 0068 다음. 적용 전에 코드가 먼저 나가도 부스 하트 저장은 막히지 않는다
-- (브랜드 따라가기는 실패를 로그로만 남긴다, src/lib/brands/follow.ts).
-- ---------------------------------------------------------------------------

alter table brand_heart
  add column if not exists source text not null default 'direct';

alter table brand_heart drop constraint if exists brand_heart_source_check;
alter table brand_heart
  add constraint brand_heart_source_check check (source in ('direct', 'booth'));

drop policy if exists "own row update brand_heart" on brand_heart;
create policy "own row update brand_heart" on brand_heart
  for update using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

comment on column brand_heart.source is
  'direct = 사용자가 브랜드에 직접 남김, booth = 부스 하트를 따라 서버가 남김(UI 23, 2026-11-24). booth 줄만 부스 하트를 뺄 때 같이 빠진다.';
