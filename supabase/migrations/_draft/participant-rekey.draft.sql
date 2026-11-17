-- ===========================================================================
-- 초안 — 적용하지 않는다. 번호 없음. STEP 1, 2는 0062, 0063으로 옮겼다(2026-11-17). 옮기기 함수는 0062에만 있다.
--
-- 이 파일은 `supabase/migrations/_draft/` 아래에 있고 이름이 숫자로 시작하지 않는다.
-- 이 레포는 마이그레이션을 손으로(Supabase SQL Editor) 적용하고, 번호 파일
-- `supabase/migrations/000N_*.sql`만 정식이다(CLAUDE.md "DB"). Supabase CLI도 쓰지 않는다.
-- Ted 승인 뒤 단계마다 main 기준 다음 번호(지금은 0062부터)로 옮겨 적고, 그때 적용한다.
--
-- 감사 문서: docs/decisions/2026-11-17_스키마-정규화-감사.md
--
-- 결정(Ted, 2026-11-17): "무조건 브랜드가 우선이라고. 브랜드가 어떤 박람회에 참여하던 말던은
-- 자유겠지. 근데 특정 브랜드가 어떤 박람회에 참여한대, 그럼 그때 '오 하는구나' 하고 등록하면
-- 그만인 거라고. 부스는 그 이후인 거지."
--
-- 모델:  exhibitor(브랜드, 뿌리) → exhibition_participant(출전, 가벼운 기록, 부스 없음)
--        → booth_participant(부스 배정, 나중에, 선택, 바뀔 수 있음) → booth(자리)
--
-- 연락과 허락을 둘로 나눈다:
--   brand_outreach        브랜드 단위. 누구에게 어떻게 연락하나(채널, 핸들, 연락 금지).
--   brand_outreach_log    브랜드 단위 VOC 원장. 특정 출전 이야기면 participant_id를 단다(선택).
--   participant_permission 출전 단위. 그 회차 콘텐츠에 무엇을 써도 되나(상태, 허락 범위, 받은 자료).
-- 옛 brand_contact, brand_contact_log(부스 키, 0061)는 새 테이블로 옮긴 뒤 STEP 4에서 지운다.
--
-- 단계(한 번에 하나씩, 각 단계 뒤 코드 배포와 확인):
--   STEP 0  사전 확인(읽기만)
--   STEP 1  더하기(새 테이블, 새 칸, 새 제약). 지금 코드에 영향 없음
--   STEP 2  채우기(백필). 지금 코드에 영향 없음
--   (코드 배포 A: 새 테이블로 읽고 쓴다. 옛 테이블은 읽기만 폴백)
--   STEP 3  바꾸기(not null, 부스 키 선택으로). 옛 코드의 후보 쓰기는 여기서 깨진다
--   (코드 배포 B, 한 주 이상 운영)
--   STEP 4  지우기(옛 테이블, 옛 칸, 옛 트리거)
--   ROLLBACK 단계별 되돌리기는 파일 맨 아래
--
-- 2026-11-17 운영 읽기 결과(서비스 롤 count만): brand_contact 0행, brand_contact_log 0행,
-- exhibitor_link_candidate 33행, exhibition_participant 2595행 중 부스 없는 출전 251행
-- (전부 newyear-store-2026), (exhibition_id, code) 중복 부스 0, hall과 booth의 박람회 어긋남 0.
-- 대표 배정된 부스 중 부스에만 인스타가 있는 곳 113, 부스와 브랜드 인스타가 다른 곳 23.
-- ===========================================================================


-- ===========================================================================
-- STEP 0 — 사전 확인(읽기만). 결과가 기대와 다르면 멈춘다.
-- ===========================================================================

-- 0-1. 옛 연락 기록 행 수. 0이면 STEP 2의 연락 백필은 할 일이 없다.
select count(*) as brand_contact_rows from brand_contact;
select count(*) as brand_contact_log_rows from brand_contact_log;

-- 0-2. 옛 연락 기록 중 대표 배정이 없는 부스에 붙은 행(백필로 출전을 못 찾는다). 0이어야 한다.
select c.booth_id
  from brand_contact c
  left join booth_participant bp on bp.booth_id = c.booth_id and bp.role = 'primary'
 where bp.booth_id is null;

-- 0-3. 연결 후보 중 대표 배정이 없는 부스(백필 불가). 0이어야 한다.
select l.id, l.booth_id
  from exhibitor_link_candidate l
  left join booth_participant bp on bp.booth_id = l.booth_id and bp.role = 'primary'
 where bp.booth_id is null;

-- 0-4. 같은 박람회에서 brands.v1 키가 겹치는 출전. 0이어야 unique를 걸 수 있다.
select exhibition_id, metadata->>'brandKey' as k, count(*)
  from exhibition_participant
 where metadata ? 'brandKey'
 group by 1, 2 having count(*) > 1;

-- 0-5. 같은 박람회 안 부스 번호 중복. 0이어야 unique를 걸 수 있다.
select exhibition_id, code, count(*)
  from booth where code is not null
 group by 1, 2 having count(*) > 1;

-- 0-6. 브랜드 인스타가 비었고 대표 부스에는 있는 곳(STEP 2-5가 채운다), 서로 다른 곳(사람이 본다).
select e.id, e.canonical_name, e.instagram_url as brand_ig, b.instagram_url as booth_ig
  from exhibitor e
  join exhibition_participant p on p.exhibitor_id = e.id
  join booth_participant bp on bp.participant_id = p.id and bp.role = 'primary'
  join booth b on b.id = bp.booth_id
 where b.instagram_url is not null
   and (e.instagram_url is null or e.instagram_url <> b.instagram_url)
 order by (e.instagram_url is null), e.canonical_name;

-- 0-7. 제약 이름 확인(STEP 3, 4가 이 이름을 지운다. 기본 이름이 아니면 고친다).
select conrelid::regclass as tbl, conname, pg_get_constraintdef(oid)
  from pg_constraint
 where conrelid in ('brand_contact'::regclass, 'brand_contact_log'::regclass,
                    'exhibitor_link_candidate'::regclass)
 order by 1, 2;


-- ===========================================================================
-- STEP 1 — 더하기. 지금 코드는 새 테이블과 칸을 모른다. 읽기와 쓰기에 영향 없음.
-- 위험: 낮음. exhibition_participant는 공개 읽기 정책이 있어 intake_key도 방문객 키로
--       읽힌다(값은 'ny-303' 같은 주최 측 브랜드 번호라 민감하지 않음).
--       새 테이블 셋은 RLS를 켜고 정책을 두지 않는다(서비스 롤 전용, 0061과 같음).
-- ===========================================================================
begin;

-- 1-1. 출전의 인입 열쇠. brands.v1의 `key`와 intake.v1 부스 행의 `brandKey`가 이 값이다.
--      번호가 나중에 들어올 때 이 열쇠로 정확히 그 출전에 잇는다(이름 맞추기 대신).
--      평범한 unique라 PostgREST onConflict에 쓸 수 있다(null은 서로 겹치지 않는다).
alter table exhibition_participant add column if not exists intake_key text;
do $$ begin
  alter table exhibition_participant
    add constraint exhibition_participant_intake_key_uniq unique (exhibition_id, intake_key);
exception when duplicate_object or duplicate_table then null; end $$;

-- 1-2. (id, exhibition_id) unique — 출전 허락이 "출전과 같은 박람회"를 트리거 대신
--      복합 FK로 지키게 하려는 것. id가 이미 PK라 데이터상 늘 참이다.
do $$ begin
  alter table exhibition_participant
    add constraint exhibition_participant_id_exhibition_uniq unique (id, exhibition_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- 1-3. 브랜드 단위 연락처. 박람회와 무관하게 "이 브랜드에 누구로 어떻게 닿나".
--      브랜드를 합칠 때 사라지지 않게 restrict — mergeExhibitor가 먼저 옮긴다.
create table if not exists brand_outreach (
  exhibitor_id    text primary key references exhibitor(id) on delete restrict,
  channel         text check (channel in ('instagram', 'x', 'email', 'other')),
  handle          text,
  -- 내려 달라는 요청 등으로 더 연락하지 않는 브랜드. 모든 박람회에 걸린다.
  do_not_contact  boolean not null default false,
  notes           text,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- 1-4. 출전 단위 허락. "이번 회차 콘텐츠에 무엇을 써도 되나". 0061 brand_contact의 상태와 허락 칸.
--      exhibition_id는 출전에서 따라 나오지만 박람회별 진행 현황 인덱스 때문에 두고,
--      복합 FK로 어긋날 수 없게 묶는다(옛 트리거 대신).
create table if not exists participant_permission (
  participant_id  text primary key,
  exhibition_id   text not null,
  status          text not null default 'not-sent'
                  check (status in ('not-sent', 'sent', 'read', 'replied', 'granted',
                                    'partial', 'declined', 'no-reply', 'withdrawn')),
  sent_at         date,
  reply           text,
  allowed_use     jsonb not null default '[]'::jsonb,
  photo_source    text,
  text_source     text,
  notes           text,
  checklist       jsonb not null default '{}'::jsonb,
  updated_by      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (participant_id, exhibition_id)
    references exhibition_participant (id, exhibition_id) on delete restrict
);
create index if not exists participant_permission_exhibition_status_idx
  on participant_permission (exhibition_id, status);

-- 1-5. 브랜드 단위 VOC 원장. 쌓기만 한다(0061과 같음). 특정 회차 이야기면 participant_id.
create table if not exists brand_outreach_log (
  id              text primary key,
  exhibitor_id    text not null references exhibitor(id) on delete restrict,
  participant_id  text references exhibition_participant(id) on delete set null,
  direction       text not null check (direction in ('outbound', 'inbound', 'internal')),
  kind            text not null
                  check (kind in ('message', 'permission', 'edit-request',
                                  'takedown-request', 'thanks', 'other')),
  channel         text check (channel in ('instagram', 'x', 'email', 'other')),
  summary         text not null,
  actor           text,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now()
);
create index if not exists brand_outreach_log_exhibitor_idx
  on brand_outreach_log (exhibitor_id, occurred_at desc);
create index if not exists brand_outreach_log_participant_idx
  on brand_outreach_log (participant_id, occurred_at desc) where participant_id is not null;

alter table brand_outreach enable row level security;
alter table participant_permission enable row level security;
alter table brand_outreach_log enable row level security;

-- 1-6. 연결 후보의 새 키. 부스 없는 출전(brands.v1)도 "같은 브랜드인가요?" 후보가 될 수 있게.
alter table exhibitor_link_candidate
  add column if not exists participant_id text references exhibition_participant(id) on delete cascade;

-- 1-7. 박람회 안 부스 번호 유일. 인입이 code를 자연키로 쓰는데 DB에는 제약이 없었다.
--      번호가 없는 부스(null)는 몇 개든 된다.
do $$ begin
  alter table booth add constraint booth_exhibition_code_uniq unique (exhibition_id, code);
exception when duplicate_object or duplicate_table then null; end $$;

commit;


-- ===========================================================================
-- STEP 2 — 채우기. 멱등(이미 채운 행은 건너뛴다). 지금 코드에 영향 없음.
-- 위험: 낮음. 0-2, 0-3이 0이 아니면 그 행은 비어 남는다 → 2-확인에서 멈춘다.
-- ===========================================================================
begin;

-- 2-1. brands.v1이 metadata에 남긴 열쇠를 칸으로.
update exhibition_participant
   set intake_key = metadata->>'brandKey'
 where intake_key is null
   and metadata ? 'brandKey';

-- 2-2. 옛 연락(부스) → 출전 허락. 부스의 대표 출전으로.
insert into participant_permission
  (participant_id, exhibition_id, status, sent_at, reply, allowed_use, photo_source,
   text_source, notes, checklist, updated_by, created_at, updated_at)
select bp.participant_id, c.exhibition_id, c.status, c.sent_at, c.reply, c.allowed_use,
       c.photo_source, c.text_source, c.notes, c.checklist, c.updated_by, c.created_at, c.updated_at
  from brand_contact c
  join booth_participant bp on bp.booth_id = c.booth_id and bp.role = 'primary'
on conflict (participant_id) do nothing;

-- 2-3. 옛 연락의 채널과 핸들 → 브랜드 연락처. 한 브랜드에 여러 회차가 있으면 가장 최근에 고친 것.
insert into brand_outreach (exhibitor_id, channel, handle, updated_by, created_at, updated_at)
select distinct on (p.exhibitor_id)
       p.exhibitor_id, c.channel, c.handle, c.updated_by, c.created_at, c.updated_at
  from brand_contact c
  join booth_participant bp on bp.booth_id = c.booth_id and bp.role = 'primary'
  join exhibition_participant p on p.id = bp.participant_id
 where c.channel is not null or c.handle is not null
 order by p.exhibitor_id, c.updated_at desc
on conflict (exhibitor_id) do nothing;

-- 2-4. 옛 VOC → 브랜드 VOC(어느 회차 이야기였는지는 participant_id로 남긴다).
insert into brand_outreach_log
  (id, exhibitor_id, participant_id, direction, kind, channel, summary, actor, occurred_at, created_at)
select l.id, p.exhibitor_id, p.id, l.direction, l.kind, l.channel, l.summary, l.actor, l.occurred_at, l.created_at
  from brand_contact_log l
  join booth_participant bp on bp.booth_id = l.booth_id and bp.role = 'primary'
  join exhibition_participant p on p.id = bp.participant_id
on conflict (id) do nothing;

-- 2-5. 연결 후보: 부스 → 그 부스의 대표 출전.
update exhibitor_link_candidate l
   set participant_id = bp.participant_id
  from booth_participant bp
 where bp.booth_id = l.booth_id
   and bp.role = 'primary'
   and l.participant_id is null;

-- 2-6. 브랜드 인스타와 웹이 비었으면 대표 부스 값으로(브랜드가 원천이 되도록).
--      다른 값이 이미 있는 23곳은 건드리지 않는다(0-6 목록을 사람이 본다).
--      한 브랜드에 부스가 여럿이면 가장 최근 박람회 부스 값.
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

-- 2-확인. 전부 0이어야 STEP 3으로 간다.
select (select count(*) from brand_contact) - (select count(*) from participant_permission
         where participant_id in (select bp.participant_id from brand_contact c
           join booth_participant bp on bp.booth_id = c.booth_id and bp.role = 'primary')) as permission_missing;
select (select count(*) from brand_contact_log) - (select count(*) from brand_outreach_log
         where id in (select id from brand_contact_log)) as log_missing;
select count(*) from exhibitor_link_candidate where participant_id is null;
select count(*) from exhibition_participant where metadata ? 'brandKey' and intake_key is null;


-- ===========================================================================
-- (코드 배포 A) 연락은 brand_outreach, participant_permission, brand_outreach_log로 쓰고 읽는다.
-- 옛 brand_contact는 더 쓰지 않는다. 연결 후보는 participant_id로 쓴다.
-- 인입은 intake_key를 쓰고 읽는다. 이 배포가 운영에 나간 뒤에만 STEP 3.
-- ===========================================================================


-- ===========================================================================
-- STEP 3 — 바꾸기. 연결 후보의 열쇠를 출전으로. 옛 코드(booth_id만 넣는 후보 쓰기)는 깨진다.
-- 위험: 중간. 배포 A 전에 돌리면 인입의 후보 쓰기가 실패한다.
-- ===========================================================================
begin;

alter table exhibitor_link_candidate alter column participant_id set not null;
alter table exhibitor_link_candidate alter column booth_id drop not null;
do $$ begin
  alter table exhibitor_link_candidate
    add constraint exhibitor_link_candidate_participant_exhibitor_uniq unique (participant_id, exhibitor_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- 옛 연락이 남아 있는 동안 새 쓰기를 막는다(배포 A가 안 쓰는지 확인하는 장치이기도 하다).
revoke insert, update on brand_contact, brand_contact_log from service_role;

commit;


-- ===========================================================================
-- (코드 배포 B) 옛 테이블과 후보의 booth_id를 더 읽지 않는다. 한 주 이상 운영한 뒤 STEP 4.
-- ===========================================================================


-- ===========================================================================
-- STEP 4 — 지우기. 지우기 전에 떠 둔다(SQL Editor 결과 내보내기, 또는):
--   copy (select * from brand_contact) to stdout with csv header;
--   copy (select * from brand_contact_log) to stdout with csv header;
-- 위험: 낮음(배포 B 뒤라면). 이후 되돌리려면 0061의 두 테이블을 다시 만들고 채워야 한다.
-- ===========================================================================
begin;

drop table if exists brand_contact_log;
drop table if exists brand_contact;
drop function if exists validate_brand_contact_exhibition() cascade;

alter table exhibitor_link_candidate drop constraint if exists exhibitor_link_candidate_booth_id_exhibitor_id_key;
alter table exhibitor_link_candidate drop column if exists booth_id;

-- brands.v1 열쇠는 칸으로 옮겼다. 두 곳이 어긋나지 않게 metadata 사본을 지운다
-- (코드가 intake_key만 쓰는 게 확인된 뒤).
update exhibition_participant set metadata = metadata - 'brandKey' where metadata ? 'brandKey';

commit;


-- ===========================================================================
-- ROLLBACK
-- ===========================================================================

-- STEP 1 되돌리기(새 테이블에 손으로 쓴 행이 있으면 먼저 떠 둔다):
--   drop table if exists brand_outreach_log;
--   drop table if exists participant_permission;
--   drop table if exists brand_outreach;
--   alter table booth drop constraint if exists booth_exhibition_code_uniq;
--   alter table exhibitor_link_candidate drop column if exists participant_id;
--   alter table exhibition_participant drop constraint if exists exhibition_participant_id_exhibition_uniq;
--   alter table exhibition_participant drop constraint if exists exhibition_participant_intake_key_uniq;
--   alter table exhibition_participant drop column if exists intake_key;

-- STEP 2 되돌리기: 새 테이블을 비우고 칸을 비운다(원래 값은 옛 테이블, booth_id, metadata에 그대로).
-- 2-6(브랜드 인스타와 웹 채우기)은 되돌리지 않는다 — 빈 칸만 채웠고, 채운 값은 부스에 그대로 있다.
--   delete from brand_outreach_log where id in (select id from brand_contact_log);
--   delete from participant_permission;
--   delete from brand_outreach;
--   update exhibition_participant set intake_key = null;
--   update exhibitor_link_candidate set participant_id = null;

-- STEP 3 되돌리기(STEP 4 이전, 부스 없는 후보가 아직 없을 때만):
--   begin;
--   grant insert, update on brand_contact, brand_contact_log to service_role;
--   alter table exhibitor_link_candidate drop constraint if exists exhibitor_link_candidate_participant_exhibitor_uniq;
--   alter table exhibitor_link_candidate alter column booth_id set not null;  -- 부스 없는 후보가 생겼으면 실패
--   alter table exhibitor_link_candidate alter column participant_id drop not null;
--   commit;
-- ⚠️ STEP 3 이후 부스 없는 출전의 후보가 생겼으면 그 행을 먼저 떠 두고 지워야 되돌릴 수 있다.
