-- ---------------------------------------------------------------------------
-- 0063: 브랜드 먼저 — 빈 칸 채우기 (정규화 STEP 2). 0062 다음에 실행한다.
--
-- 빈 값만 채운다. 이미 값이 있는 칸과 행은 건드리지 않는다. 여러 번 돌려도 같다(멱등).
-- 감사와 설계: docs/decisions/2026-11-17_스키마-정규화-감사.md
--
-- 기대 결과(2026-11-17 백업 data/intake/_backup/schema-step1-before-2026-11-17T03-26-26-011Z.json 기준):
--   exhibition_participant.intake_key   251행 채움(전부 newyear-store-2026)
--   exhibitor_link_candidate.participant_id  33행 채움
--   exhibitor.instagram_url  112곳, website_url 105곳 채움(브랜드에 비어 있고 대표 부스에 있던 곳)
--   brand_outreach, participant_permission, brand_outreach_log  0행(옛 brand_contact가 0행)
-- 브랜드와 부스 인스타가 서로 다른 23곳은 건드리지 않는다(사람이 본다, 감사 10절).
--
-- 적용은 손으로 한다(Supabase SQL Editor). 되돌리기는 맨 아래.
-- ---------------------------------------------------------------------------
begin;

-- 1. brands.v1이 metadata에 남긴 열쇠를 칸으로.
update exhibition_participant
   set intake_key = metadata->>'brandKey'
 where intake_key is null
   and metadata ? 'brandKey';

-- 2. 옛 연락(부스 키) → 출전 허락. 부스의 대표 출전으로. (지금 0행)
insert into participant_permission
  (participant_id, exhibition_id, status, sent_at, reply, allowed_use, photo_source,
   text_source, notes, checklist, updated_by, created_at, updated_at)
select bp.participant_id, c.exhibition_id, c.status, c.sent_at, c.reply, c.allowed_use,
       c.photo_source, c.text_source, c.notes, c.checklist, c.updated_by, c.created_at, c.updated_at
  from brand_contact c
  join booth_participant bp on bp.booth_id = c.booth_id and bp.role = 'primary'
on conflict (participant_id) do nothing;

-- 3. 옛 연락의 채널과 핸들 → 브랜드 연락처. 여러 회차면 가장 최근에 고친 것. (지금 0행)
insert into brand_outreach (exhibitor_id, channel, handle, updated_by, created_at, updated_at)
select distinct on (p.exhibitor_id)
       p.exhibitor_id, c.channel, c.handle, c.updated_by, c.created_at, c.updated_at
  from brand_contact c
  join booth_participant bp on bp.booth_id = c.booth_id and bp.role = 'primary'
  join exhibition_participant p on p.id = bp.participant_id
 where c.channel is not null or c.handle is not null
 order by p.exhibitor_id, c.updated_at desc
on conflict (exhibitor_id) do nothing;

-- 4. 옛 VOC → 브랜드 VOC(어느 회차였는지는 participant_id로). (지금 0행)
insert into brand_outreach_log
  (id, exhibitor_id, participant_id, direction, kind, channel, summary, actor, occurred_at, created_at)
select l.id, p.exhibitor_id, p.id, l.direction, l.kind, l.channel, l.summary, l.actor, l.occurred_at, l.created_at
  from brand_contact_log l
  join booth_participant bp on bp.booth_id = l.booth_id and bp.role = 'primary'
  join exhibition_participant p on p.id = bp.participant_id
on conflict (id) do nothing;

-- 5. 연결 후보: 부스 → 그 부스의 대표 출전.
update exhibitor_link_candidate l
   set participant_id = bp.participant_id
  from booth_participant bp
 where bp.booth_id = l.booth_id
   and bp.role = 'primary'
   and l.participant_id is null;

-- 6. 브랜드 인스타와 웹이 비었으면 가장 최근 박람회 대표 부스 값으로(브랜드가 원천이 되도록).
update exhibitor e
   set instagram_url = s.instagram_url, updated_at = now()
  from (
    select distinct on (p.exhibitor_id) p.exhibitor_id, b.instagram_url
      from exhibition_participant p
      join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
      join booth b on b.id = bp.booth_id
      join exhibition x on x.id = p.exhibition_id
     where b.instagram_url is not null
     order by p.exhibitor_id, x.start_date desc
  ) s
 where s.exhibitor_id = e.id and e.instagram_url is null;

update exhibitor e
   set website_url = s.website_url, updated_at = now()
  from (
    select distinct on (p.exhibitor_id) p.exhibitor_id, b.website_url
      from exhibition_participant p
      join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
      join booth b on b.id = bp.booth_id
      join exhibition x on x.id = p.exhibition_id
     where b.website_url is not null
     order by p.exhibitor_id, x.start_date desc
  ) s
 where s.exhibitor_id = e.id and e.website_url is null;

commit;

-- 확인(전부 0이어야 한다):
--   select count(*) from exhibition_participant where metadata ? 'brandKey' and intake_key is null;
--   select count(*) from exhibitor_link_candidate where participant_id is null;
--
-- 되돌리기: 1, 5는 칸을 비우면 된다(원래 값은 metadata와 booth_id에 그대로).
--   update exhibition_participant set intake_key = null;
--   update exhibitor_link_candidate set participant_id = null;
-- 6은 백업 파일의 exhibitor.instagram_url, website_url이 null이던 행을 다시 null로 돌린다
-- (채운 값은 대표 부스에 그대로 있어 잃는 정보는 없다).
