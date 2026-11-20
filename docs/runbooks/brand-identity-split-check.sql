-- ---------------------------------------------------------------------------
-- 뭉친 브랜드 점검 — 읽기 전용(select만). 런북: docs/runbooks/brand-identity-split.md
--
-- 2026-11-20 전까지 lib/exhibitor/identity.ts가 링크 모음, SNS, 마켓 주소를 계정이 아니라 도메인으로
-- 맞대서, 같은 서비스를 쓰는 서로 다른 작가가 한 브랜드(exhibitor)로 묶였을 수 있다.
-- 아래 넷은 서로 독립이다. Supabase SQL Editor에서 하나씩 돌려 결과를 저장한다.
--
-- 인스타 계정이 가장 믿을 만한 신원이라, "한 브랜드에 서로 다른 인스타 계정이 둘 이상"을 뭉침으로 본다.
-- ---------------------------------------------------------------------------


-- [Q1] 뭉친 브랜드 요약 — 한 브랜드에 붙은 부스의 인스타 계정이 둘 이상인 곳.
--      ig_accounts가 2 이상이면 뭉친 것이다. same_fair_booths는 한 행사에 부스가 둘 이상 붙은 수(참고).
with b as (
  select x.id as exhibitor_id,
         x.canonical_name,
         p.exhibition_id,
         bo.id as booth_id,
         nullif(lower(substring(bo.instagram_url from '(?i)instagram\.com/([^/?#]+)')), '') as ig,
         lower(substring(bo.website_url from '(?i)^(?:[a-z]+://)?(?:www\.|m\.)?([^/?#:]+)')) as web_host
    from exhibitor x
    join exhibition_participant p on p.exhibitor_id = x.id
    join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
    join booth bo on bo.id = bp.booth_id
)
select exhibitor_id,
       canonical_name,
       count(*)                                        as booths,
       count(distinct ig)                              as ig_accounts,
       count(*) filter (where ig is null)              as booths_without_ig,
       count(distinct exhibition_id)                   as exhibitions,
       count(*) - count(distinct exhibition_id)        as same_fair_booths,
       array_agg(distinct web_host) filter (where web_host is not null) as web_hosts
  from b
 group by exhibitor_id, canonical_name
having count(distinct ig) > 1
 order by ig_accounts desc, booths desc;


-- [Q2] 뭉친 브랜드의 부스 한 줄씩 — 어느 부스를 떼어 낼지 보는 표.
--      keeper = 그 브랜드의 대표 인스타(exhibitor.instagram_url)와 같은 계정이면 true. 대표 인스타가 없으면
--      가장 먼저 배정된 부스의 계정을 keeper로 본다(쓰기 초안과 같은 규칙).
with b as (
  select x.id as exhibitor_id,
         x.canonical_name,
         nullif(lower(substring(x.instagram_url from '(?i)instagram\.com/([^/?#]+)')), '') as brand_ig,
         p.id as participant_id,
         p.exhibition_id,
         p.display_name,
         bo.id as booth_id,
         bo.code,
         bo.name as booth_name,
         bo.instagram_url,
         bo.website_url,
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
select b.exhibitor_id,
       b.canonical_name,
       b.exhibition_id,
       b.participant_id,
       b.display_name,
       b.code,
       b.booth_name,
       b.ig,
       b.website_url,
       coalesce(b.ig = k.keeper_ig, false) as keeper
  from b
  join keeper k using (exhibitor_id)
 order by b.canonical_name, keeper desc, b.code;


-- [Q3] 뭉친 브랜드에 붙은 다른 기록 — 떼어 낼 때 사람이 어느 작가 것인지 봐야 하는 것들.
--      0이 아닌 칸이 있는 브랜드는 런북 4단계에서 따로 본다.
with b as (
  select x.id as exhibitor_id,
         nullif(lower(substring(bo.instagram_url from '(?i)instagram\.com/([^/?#]+)')), '') as ig
    from exhibitor x
    join exhibition_participant p on p.exhibitor_id = x.id
    join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
    join booth bo on bo.id = bp.booth_id
),
merged as (
  select exhibitor_id from b group by exhibitor_id having count(distinct ig) > 1
)
select m.exhibitor_id,
       x.canonical_name,
       (select count(*) from brand_heart h where h.exhibitor_id = m.exhibitor_id)          as brand_hearts,
       -- notification_log엔 브랜드 칸이 없다. dedupe_key = 'brand_appear:<user>:<exhibitor>:<exhibition>'(0071).
       (select count(*) from notification_log n
         where n.dedupe_key like 'brand_appear:%:' || m.exhibitor_id || ':%')                as notifications,
       (select count(*) from brand_outreach o where o.exhibitor_id = m.exhibitor_id)       as outreach,
       (select count(*) from brand_outreach_log l where l.exhibitor_id = m.exhibitor_id)   as outreach_log,
       (select count(*) from participant_permission pp
          join exhibition_participant p on p.id = pp.participant_id
         where p.exhibitor_id = m.exhibitor_id)                                            as permissions,
       (select count(*) from brand_profile_field f
         where f.exhibitor_id = m.exhibitor_id
            or f.participant_id in (select id from exhibition_participant where exhibitor_id = m.exhibitor_id)) as profile_fields,
       (select count(*) from exhibitor_link_candidate c where c.exhibitor_id = m.exhibitor_id) as link_candidates
  from merged m
  join exhibitor x on x.id = m.exhibitor_id
 order by x.canonical_name;


-- [Q4] 부스 없는 브랜드(brands.v1, 브랜드 먼저 인입) 쪽 — 부스가 없어 Q1에 안 잡힌다.
--  (a) 한 참가 사실에 파일 열쇠가 둘 이상 묶인 곳(파일 안에서 링크로 합쳐진 것).
select p.id as participant_id,
       p.exhibition_id,
       p.exhibitor_id,
       p.display_name,
       p.aliases,
       p.metadata->'brandKeys' as brand_keys
  from exhibition_participant p
 where jsonb_typeof(p.metadata->'brandKeys') = 'array'
   and jsonb_array_length(p.metadata->'brandKeys') > 1
 order by p.exhibition_id, p.display_name;

--  (b) 브랜드 프로필 링크 칸에 서로 다른 인스타 계정이 둘 이상인 브랜드.
with links as (
  select coalesce(f.exhibitor_id, p.exhibitor_id) as exhibitor_id,
         nullif(lower(substring(l->>'url' from '(?i)instagram\.com/([^/?#]+)')), '') as ig
    from brand_profile_field f
    left join exhibition_participant p on p.id = f.participant_id
    cross join lateral jsonb_array_elements(case when jsonb_typeof(f.value) = 'array' then f.value else '[]'::jsonb end) l
   where f.field = 'links'
)
select l.exhibitor_id, x.canonical_name, count(distinct l.ig) as ig_accounts, array_agg(distinct l.ig) as igs
  from links l
  join exhibitor x on x.id = l.exhibitor_id
 group by l.exhibitor_id, x.canonical_name
having count(distinct l.ig) > 1
 order by ig_accounts desc;

--  (c) 행사마다 표기 이름이 다르고, 브랜드 웹 주소가 이번에 고친 공용 서비스인 브랜드(참고, 눈으로 본다).
select x.id as exhibitor_id,
       x.canonical_name,
       x.website_url,
       array_agg(distinct p.display_name) as names,
       count(distinct p.exhibition_id) as exhibitions
  from exhibitor x
  join exhibition_participant p on p.exhibitor_id = x.id
 where lower(substring(x.website_url from '(?i)^(?:[a-z]+://)?(?:www\.|m\.)?([^/?#:]+)')) in (
         'link.inpock.co.kr', 'instabio.cc', 'grafolio.ogq.me', 'grafolio.com', 'marpple.shop', 'threads.net',
         'threads.com', 'linkon.id', 'linkseller.net', 'linkbio.co', 'linkfly.to', 'twenty.style',
         'picturebook-illust.com', 'xiaohongshu.com', 'xhslink.com', 'brunch.co.kr', 'artstation.com', 'postype.com',
         'revind.io', 'pixpills.com', 'idus.kr', 'idus.com', 'etsy.com', 'airbridge.tumblbug.com', 'tumblbug.com',
         'wadiz.kr', 'product.kyobobook.co.kr', 'yes24.com', 'comic.naver.com', 'youtube.com', 'youtu.be',
         'beacons.ai', 'taplink.cc', 'lit.link', 'bio.link', 'allmylinks.com', 'ko-fi.com', 'patreon.com',
         'pinterest.com', 'pinterest.co.kr', 'kr.pinterest.com')
 group by x.id, x.canonical_name, x.website_url
having count(distinct p.display_name) > 1
 order by exhibitions desc, x.canonical_name;
