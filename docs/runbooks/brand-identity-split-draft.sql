-- ---------------------------------------------------------------------------
-- 뭉친 브랜드 가르기 — 쓰기 SQL **초안**. 아직 한 번도 돌리지 않았다.
-- 런북: docs/runbooks/brand-identity-split.md (백업, 점검, 이 파일, 백필 다시 돌리기 순서)
--
-- 하는 일: 한 브랜드에 서로 다른 인스타 계정의 부스가 붙어 있으면, 대표 인스타(keeper)와 다른 부스의
-- 대표 배정(booth_participant)을 뗀다. 새 브랜드는 여기서 만들지 않는다 — 뗀 부스는 고친 판정(identity.ts)으로
-- /admin 백필이 다시 잇는다. 같은 작가가 지난 행사에 있었으면 그 브랜드에, 없으면 새 브랜드에 붙는다.
-- 그래서 고친 코드가 배포된 뒤에 돌린다(옛 코드로 백필하면 그대로 다시 뭉친다).
--
-- 드라이런이 기본이다. 맨 끝 [드라이런] 블록이 숫자를 담은 오류를 내서 트랜잭션 전체가 되돌려진다
-- (Supabase SQL Editor는 마지막 결과만 보여 주니 숫자를 오류 메시지로 띄운다). 숫자가 점검 Q1~Q3과 맞으면
-- 그 블록만 지우고 다시 돌린다. 그때 맨 끝 commit이 적용한다.
-- ---------------------------------------------------------------------------
begin;

-- 0. 뗄 부스 목록. 점검 SQL Q2와 같은 규칙이다.
--    keeper = 브랜드 대표 인스타(exhibitor.instagram_url)와 같은 계정. 그 계정의 부스가 없으면 가장 먼저 배정된 부스의 계정.
--    인스타가 없는 부스도 뗀다 — 진짜 같은 브랜드면 백필이 웹 주소 계정으로 다시 잇는다.
create temp table split_booth on commit drop as
with b as (
  select x.id as exhibitor_id,
         nullif(lower(substring(x.instagram_url from '(?i)instagram\.com/([^/?#]+)')), '') as brand_ig,
         p.id as participant_id,
         bo.id as booth_id,
         bp.created_at as assigned_at,
         nullif(lower(substring(bo.instagram_url from '(?i)instagram\.com/([^/?#]+)')), '') as ig
    from exhibitor x
    join exhibition_participant p on p.exhibitor_id = x.id
    join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
    join booth bo on bo.id = bp.booth_id
),
merged as (
  select exhibitor_id from b group by exhibitor_id having count(distinct ig) > 1
),
keeper as (
  select distinct on (b.exhibitor_id)
         b.exhibitor_id,
         coalesce(b.brand_ig, b.ig) as keeper_ig
    from b
    join merged using (exhibitor_id)
   where b.ig is not null
   order by b.exhibitor_id, (b.ig = b.brand_ig) desc nulls last, b.assigned_at, b.booth_id
)
select b.booth_id, b.participant_id, b.exhibitor_id
  from b
  join keeper k using (exhibitor_id)
 where b.ig is distinct from k.keeper_ig;

create temp table split_report (k text primary key, v bigint) on commit drop;
insert into split_report values
  ('뗄 부스', (select count(*) from split_booth)),
  ('뭉친 브랜드', (select count(distinct exhibitor_id) from split_booth)),
  ('건드린 참가 사실', (select count(distinct participant_id) from split_booth));


-- 1. 대표 배정을 뗀다.
delete from booth_participant bp
 using split_booth s
 where bp.booth_id = s.booth_id
   and bp.participant_id = s.participant_id
   and bp.role = 'primary';


-- 2. 부스가 하나도 안 남은 참가 사실. 부스 인입이 만든 것(intake_key 없음)만 지운다.
--    남겨 두면 다음 백필이 같은 행사의 "부스 없는 참가 사실"로 보고 표기 이름으로 다시 붙일 수 있다(plan.ts sameFairMatch).
--    허락, 프로필 칸, 연락 기록이 붙어 있으면 지우지 않고 멈춘다 — 런북 4단계에서 사람이 본다.
create temp table split_orphan on commit drop as
select p.id
  from exhibition_participant p
 where p.id in (select participant_id from split_booth)
   and p.intake_key is null
   and not exists (select 1 from booth_participant bp where bp.participant_id = p.id);

insert into split_report values
  ('지울 참가 사실', (select count(*) from split_orphan)),
  -- intake_key가 있는데 부스가 다 떨어진 참가 사실(브랜드 먼저 인입). 지우지 않는다. 0이 아니면 런북 4단계.
  ('부스 없이 남는 브랜드 먼저 참가', (
     select count(*) from exhibition_participant p
      where p.id in (select participant_id from split_booth)
        and p.intake_key is not null
        and not exists (select 1 from booth_participant bp where bp.participant_id = p.id)));

do $$
begin
  if exists (select 1 from participant_permission where participant_id in (select id from split_orphan))
     or exists (select 1 from brand_profile_field where participant_id in (select id from split_orphan))
     or exists (select 1 from brand_outreach_log where participant_id in (select id from split_orphan)) then
    raise exception '부스가 다 떨어진 참가 사실에 허락, 프로필 칸, 연락 기록이 있어요. 런북 4단계에서 먼저 봐 주세요';
  end if;
end $$;

-- exhibitor_link_candidate의 그 참가 사실 줄은 on delete cascade로 같이 지워진다.
delete from exhibition_participant p
 using split_orphan o
 where p.id = o.id;


-- 3. 남은 브랜드의 이름과 대표 웹 주소를 남은 부스에 맞춘다.
--    canonical_name과 display_name은 "처음 묶인 부스" 이름이라, 떼어 낸 작가 이름일 수 있다.
--    대표 웹 주소도 첫 부스 것이라 남의 링크 모음 주소일 수 있고, 그대로 두면 다음 백필이 그 작가를 다시 붙인다.
create temp table split_keep on commit drop as
select distinct on (p.id)
       p.id as participant_id,
       p.exhibitor_id,
       bo.name as booth_name,
       bo.website_url
  from exhibition_participant p
  join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
  join booth bo on bo.id = bp.booth_id
 where p.exhibitor_id in (select exhibitor_id from split_booth)
 order by p.id, bp.created_at, bo.id;

update exhibition_participant p
   set display_name = k.booth_name,
       updated_at = now()
  from split_keep k
 where p.id = k.participant_id
   and p.display_name <> k.booth_name
   and not exists (
     select 1 from booth_participant bp join booth bo on bo.id = bp.booth_id
      where bp.participant_id = p.id and bp.role = 'primary' and bo.name = p.display_name
   );

-- 브랜드 이름은 남은 부스 이름에도, 브랜드 먼저 인입이 적은 이름(intake_key 있는 참가)에도 없을 때만 바꾼다.
update exhibitor x
   set canonical_name = k.booth_name,
       updated_at = now()
  from (select distinct on (exhibitor_id) exhibitor_id, booth_name from split_keep order by exhibitor_id, participant_id) k
 where x.id = k.exhibitor_id
   and not exists (
     select 1 from split_keep s where s.exhibitor_id = x.id and s.booth_name = x.canonical_name
   )
   and not exists (
     select 1 from exhibition_participant p
      where p.exhibitor_id = x.id and p.intake_key is not null and p.display_name = x.canonical_name
   );

update exhibitor x
   set website_url = (select s.website_url from split_keep s
                       where s.exhibitor_id = x.id and s.website_url is not null
                       order by s.participant_id limit 1),
       updated_at = now()
 where x.id in (select exhibitor_id from split_booth)
   and x.website_url is not null
   and not exists (select 1 from split_keep s where s.exhibitor_id = x.id and s.website_url = x.website_url);


-- 4. 결과 확인: 점검 Q1을 다시 돌린 것과 같다. 0이어야 한다.
insert into split_report
with b as (
  select x.id as exhibitor_id,
         nullif(lower(substring(bo.instagram_url from '(?i)instagram\.com/([^/?#]+)')), '') as ig
    from exhibitor x
    join exhibition_participant p on p.exhibitor_id = x.id
    join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
    join booth bo on bo.id = bp.booth_id
)
select '아직 뭉친 브랜드', count(*)
  from (select exhibitor_id from b group by exhibitor_id having count(distinct ig) > 1) m;


-- [드라이런] 숫자를 보여 주고 전부 되돌린다. 실제로 적용할 때만 이 블록을 지운다.
do $$
begin
  raise exception '드라이런(아무것도 바뀌지 않았어요): %',
    (select string_agg(k || ' ' || v, ', ' order by k) from split_report);
end $$;

commit;
