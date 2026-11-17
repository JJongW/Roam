-- ---------------------------------------------------------------------------
-- 0062: 브랜드 먼저 — 연락처와 허락을 부스에서 떼고, 출전에 인입 열쇠를 단다 (정규화 STEP 1)
--
-- 결정(Ted, 2026-11-17): "무조건 브랜드가 우선이라고. 브랜드가 어떤 박람회에 참여하던 말던은
-- 자유겠지. 근데 특정 브랜드가 어떤 박람회에 참여한대, 그럼 그때 '오 하는구나' 하고 등록하면
-- 그만인 거라고. 부스는 그 이후인 거지." STEP 1 운영 적용 승인도 Ted(2026-11-17).
-- 감사와 설계: docs/decisions/2026-11-17_스키마-정규화-감사.md
--
-- 더하기만 한다. 기존 테이블의 행과 지금 코드의 읽기 쓰기는 바뀌지 않는다.
--   brand_outreach          브랜드 연락처(채널, 핸들, 연락 금지). 박람회와 무관
--   participant_permission  출전 허락(상태, 허락 범위, 받은 자료). 부스 없이 된다
--   brand_outreach_log      브랜드 VOC. 특정 회차 이야기면 participant_id
--   exhibition_participant.intake_key + unique(exhibition_id, intake_key)
--   exhibition_participant unique(id, exhibition_id)   허락의 박람회 일치를 복합 FK로
--   exhibitor_link_candidate.participant_id              부스 없는 출전도 후보가 되게
--   booth unique(exhibition_id, code)                    인입 자연키를 DB가 지킨다
--   move_brand_outreach(), move_participant_permission() 브랜드 합칠 때 옮기기
--
-- FK를 restrict로 둔 이유: 브랜드 합치기(repository.ts mergeExhibitor)가 같은 박람회 출전을
-- 지우고(exhibition_participant delete) 원래 브랜드를 지운다(exhibitor delete). cascade면 연락과
-- 허락과 VOC가 소리 없이 사라지고, set null이면 주인 없는 행이 남는다. restrict로 두면 옮기지
-- 않은 합치기가 실패로 드러난다. 합치기는 지우기 전에 아래 두 함수를 불러 옮긴다(칸 옮기기
-- move_brand_profile_fields와 같은 자리, 같은 규칙: 겹치면 대상 것을 지킨다).
-- 박람회를 지우는 경로는 코드에 없다. 손으로 지우면 허락 행이 막는다 — 먼저 떠 두고 지운다.
--
-- 적용 전 확인(2026-11-17, 서비스 롤 읽기): (exhibition_id, code) 중복 0, brandKey 중복 0,
-- 대표 배정 없는 연결 후보 0. 백업 data/intake/_backup/schema-step1-before-2026-11-17T03-26-26-011Z.json
--
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약. 전체를 한 번에 실행한다.
-- 되돌리기는 파일 맨 아래.
-- ---------------------------------------------------------------------------
begin;

-- 1. 출전의 인입 열쇠. brands.v1의 `key`, 나중의 intake.v1 부스 행 `brandKey`.
--    평범한 unique라 PostgREST onConflict에 쓸 수 있다(null은 서로 겹치지 않는다).
alter table exhibition_participant add column if not exists intake_key text;
do $$ begin
  alter table exhibition_participant
    add constraint exhibition_participant_intake_key_uniq unique (exhibition_id, intake_key);
exception when duplicate_object or duplicate_table then null; end $$;

-- 2. (id, exhibition_id) unique. id가 PK라 데이터상 늘 참이다.
do $$ begin
  alter table exhibition_participant
    add constraint exhibition_participant_id_exhibition_uniq unique (id, exhibition_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- 3. 브랜드 연락처.
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

-- 4. 출전 허락. exhibition_id는 박람회별 진행 현황 인덱스 때문에 두고 복합 FK로 묶는다.
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
  constraint participant_permission_participant_exhibition_fkey
    foreign key (participant_id, exhibition_id)
    references exhibition_participant (id, exhibition_id) on delete restrict
);
create index if not exists participant_permission_exhibition_status_idx
  on participant_permission (exhibition_id, status);

-- 5. 브랜드 VOC. 쌓기만 한다(0061과 같음).
--    participant_id는 set null: 출전이 합쳐지며 지워질 때는 move_participant_permission이
--    먼저 새 출전으로 옮기고, 그래도 남은 기록은 브랜드 VOC로 남는다.
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

-- 서비스 롤 전용(정책 없음). 방문객 키(anon)로는 읽고 쓸 수 없다.
alter table brand_outreach enable row level security;
alter table participant_permission enable row level security;
alter table brand_outreach_log enable row level security;

-- 6. 연결 후보의 새 키. 후보는 판단 대기라 출전이 사라지면 같이 사라져도 된다(0057의 부스와 같음).
alter table exhibitor_link_candidate
  add column if not exists participant_id text references exhibition_participant(id) on delete cascade;

-- 7. 박람회 안 부스 번호 유일. 번호 없는 부스(null)는 몇 개든 된다.
do $$ begin
  alter table booth add constraint booth_exhibition_code_uniq unique (exhibition_id, code);
exception when duplicate_object or duplicate_table then null; end $$;

-- 8. 합칠 때 옮기기. 함수 호출 하나가 트랜잭션 하나다.
-- 8-1. 브랜드 from → to. 연락처는 대상에 없으면 옮기고, 있으면 빈 칸(channel, handle, notes)만
--      채우고 연락 금지는 둘 중 하나라도 켜져 있으면 켠다(연락 금지를 잃으면 안 된다).
--      VOC는 전부 대상으로. 저장소의 mergeExhibitor가 exhibitor를 지우기 전에 부른다.
create or replace function move_brand_outreach(p_from text, p_to text)
returns integer
language plpgsql
as $$
declare
  moved integer;
begin
  insert into brand_outreach
    (exhibitor_id, channel, handle, do_not_contact, notes, updated_by, created_at, updated_at)
  select p_to, f.channel, f.handle, f.do_not_contact, f.notes, f.updated_by, f.created_at, now()
    from brand_outreach f
   where f.exhibitor_id = p_from
  on conflict (exhibitor_id) do update
     set channel        = coalesce(brand_outreach.channel, excluded.channel),
         handle         = coalesce(brand_outreach.handle, excluded.handle),
         notes          = coalesce(brand_outreach.notes, excluded.notes),
         do_not_contact = brand_outreach.do_not_contact or excluded.do_not_contact,
         updated_at     = now();
  delete from brand_outreach where exhibitor_id = p_from;
  update brand_outreach_log set exhibitor_id = p_to where exhibitor_id = p_from;
  get diagnostics moved = row_count;
  return moved;
end;
$$;

-- 8-2. 출전 from → to(같은 박람회). 허락은 대상에 없거나 대상이 아직 not-sent면 from 것을 쓰고,
--      대상에 진행된 허락이 있으면 대상 것을 지킨다(from 허락은 VOC에 남은 기록으로 추적).
--      VOC의 participant_id도 대상으로. mergeExhibitor가 출전을 지우기 전에 부른다.
create or replace function move_participant_permission(p_from text, p_to text)
returns integer
language plpgsql
as $$
declare
  moved integer;
begin
  insert into participant_permission
    (participant_id, exhibition_id, status, sent_at, reply, allowed_use, photo_source,
     text_source, notes, checklist, updated_by, created_at, updated_at)
  select p_to, f.exhibition_id, f.status, f.sent_at, f.reply, f.allowed_use, f.photo_source,
         f.text_source, f.notes, f.checklist, f.updated_by, f.created_at, now()
    from participant_permission f
   where f.participant_id = p_from
  on conflict (participant_id) do update
     set status = excluded.status, sent_at = excluded.sent_at, reply = excluded.reply,
         allowed_use = excluded.allowed_use, photo_source = excluded.photo_source,
         text_source = excluded.text_source, notes = excluded.notes,
         checklist = excluded.checklist, updated_by = excluded.updated_by, updated_at = now()
   where participant_permission.status = 'not-sent';
  delete from participant_permission where participant_id = p_from;
  update brand_outreach_log set participant_id = p_to where participant_id = p_from;
  get diagnostics moved = row_count;
  return moved;
end;
$$;

revoke all on function move_brand_outreach(text, text) from public, anon, authenticated;
revoke all on function move_participant_permission(text, text) from public, anon, authenticated;

commit;

-- 되돌리기(새 테이블에 쓴 행이 있으면 먼저 떠 둔다):
--   drop function if exists move_participant_permission(text, text);
--   drop function if exists move_brand_outreach(text, text);
--   drop table if exists brand_outreach_log;
--   drop table if exists participant_permission;
--   drop table if exists brand_outreach;
--   alter table booth drop constraint if exists booth_exhibition_code_uniq;
--   alter table exhibitor_link_candidate drop column if exists participant_id;
--   alter table exhibition_participant drop constraint if exists exhibition_participant_id_exhibition_uniq;
--   alter table exhibition_participant drop constraint if exists exhibition_participant_intake_key_uniq;
--   alter table exhibition_participant drop column if exists intake_key;
