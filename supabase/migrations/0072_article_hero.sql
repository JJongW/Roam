-- ---------------------------------------------------------------------------
-- 0072: 아티클 대표 사진(hero) 필수
--
-- 결정 기록: docs/decisions/2026-11-19_브랜드-아티클-초안-파이프라인.md "사진" 절
-- 2026-11-19 Ted: "아티클에 사진은 당연하게 넣어야 하고".
--
-- 0070(article)은 운영에 이미 적용됐다. 이미 돈 마이그레이션은 고치지 않고 이 파일로 더한다.
-- (0071은 PR #184 notification_log가 쓴다. 둘은 서로 다른 표라 순서와 무관하게 적용된다.)
--
--   hero : 대표 사진 {path, alt, credit, scope, sourceId, permissionId}. 허락 받은 사진만 들어온다 —
--          대표 사진 칸(brand_profile_field photos)을 사람이 확인했고(reviewed, artist_confirmed)
--          그 박람회 회차 연락이 허락(granted, partial)이며 허락 범위에 account-photo나 sent-photo가 있을 때.
--          코드(lib/articles/gate.ts)가 먼저 막고, 여기서 path와 permissionId가 빈 행을 한 번 더 막는다.
--   body : 블록 종류가 text, quote, photo, photo-group, brand-card로 바뀌었다(jsonb라 스키마 변경 없음).
--
-- 안전: 적용 시점에 hero 없는 행이 하나라도 있으면 아무것도 바꾸지 않고 멈춘다(예외 → 트랜잭션 되돌림).
-- 2026-11-19 기준 운영 article은 0행으로 알고 있다(워커가 아직 새 코드로 돌지 않음). 0행이면 그대로 지나간다.
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약. 먼저 백업.
-- ---------------------------------------------------------------------------

begin;

alter table article add column if not exists hero jsonb;

do $$
declare
  missing int;
begin
  select count(*) into missing from article where hero is null;
  if missing > 0 then
    raise exception '0072: hero가 없는 article 행이 %개 있어요. 사진 없는 초안은 반려하거나 지운 뒤 다시 적용하세요.', missing;
  end if;
end $$;

alter table article alter column hero set not null;

alter table article drop constraint if exists article_hero_check;
alter table article add constraint article_hero_check check (
  jsonb_typeof(hero) = 'object'
  and length(coalesce(hero ->> 'path', '')) > 0
  and length(coalesce(hero ->> 'permissionId', '')) > 0
);

commit;
