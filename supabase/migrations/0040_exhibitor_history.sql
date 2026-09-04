-- ---------------------------------------------------------------------------
-- 0040: 참가사 정체성 + 전시별 참가/부스 이력
--
-- Roam에서 사용자의 판단은 언제나 이번 회차의 물리 부스에 남는다. 다만 같은
-- 참가사가 다음 전시에 다시 올 때, 그 판단을 근거 있는 개인화 신호로 읽으려면
-- 부스의 company 텍스트만으로는 부족하다. 이 마이그레이션은 참가사 마스터,
-- 전시별 참가 이력, 물리 부스 배정을 분리한다.
--
-- 기존 booth.company는 호환성과 표시용으로 유지한다. 과거 데이터를 이름으로
-- 자동 병합하지 않는다. 이름이 같아도 다른 법인/브랜드일 수 있으므로 운영자가
-- 참가사를 확인한 뒤 exhibition_participant를 연결해야 한다.
-- ---------------------------------------------------------------------------

create table if not exists exhibitor (
  id             text primary key default gen_random_uuid()::text,
  slug           text not null unique,
  canonical_name text not null,
  legal_name     text,
  aliases        jsonb not null default '[]'::jsonb,
  website_url    text,
  instagram_url  text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- 한 참가사가 특정 전시에 어떤 이름으로 참가했는지의 회차별 사실.
create table if not exists exhibition_participant (
  id             text primary key default gen_random_uuid()::text,
  exhibition_id  text not null references exhibition(id) on delete cascade,
  exhibitor_id   text not null references exhibitor(id) on delete restrict,
  display_name   text not null,
  aliases        jsonb not null default '[]'::jsonb,
  status         text not null default 'confirmed'
                 check (status in ('confirmed', 'withdrawn', 'unverified')),
  source_urls    jsonb not null default '[]'::jsonb,
  source_note    text,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (exhibition_id, exhibitor_id)
);

-- 지도 위의 물리 부스와 참가사의 관계. 공동 부스도 잃지 않기 위해 다대다로 둔다.
create table if not exists booth_participant (
  booth_id        text not null references booth(id) on delete cascade,
  participant_id  text not null references exhibition_participant(id) on delete cascade,
  role            text not null default 'primary'
                  check (role in ('primary', 'co_exhibitor')),
  created_at      timestamptz not null default now(),
  primary key (booth_id, participant_id)
);

-- 동일 부스에는 기본적으로 한 참가사만 대표로 둔다. 공동 부스는 co_exhibitor로
-- 모두 보존하되, 사용자의 부스 평가는 대표 참가사에만 자동으로 귀속한다.
create unique index if not exists booth_participant_one_primary_idx
  on booth_participant (booth_id) where role = 'primary';

create index if not exists exhibition_participant_exhibition_idx
  on exhibition_participant (exhibition_id, status);
create index if not exists exhibition_participant_exhibitor_idx
  on exhibition_participant (exhibitor_id, exhibition_id desc);
create index if not exists booth_participant_participant_idx
  on booth_participant (participant_id, booth_id);

-- 물리 부스와 참가 이력은 반드시 같은 전시 회차에 속해야 한다.
create or replace function validate_booth_participant_exhibition()
returns trigger
language plpgsql
as $$
declare
  booth_exhibition_id text;
  participant_exhibition_id text;
begin
  select exhibition_id into booth_exhibition_id from booth where id = new.booth_id;
  select exhibition_id into participant_exhibition_id
    from exhibition_participant where id = new.participant_id;

  if booth_exhibition_id is null or participant_exhibition_id is null
     or booth_exhibition_id <> participant_exhibition_id then
    raise exception 'booth_participant must reference the same exhibition';
  end if;
  return new;
end;
$$;

drop trigger if exists booth_participant_same_exhibition on booth_participant;
create trigger booth_participant_same_exhibition
  before insert or update on booth_participant
  for each row execute function validate_booth_participant_exhibition();

-- 신호 원장에도 부스의 불변 식별자를 남긴다. booth_code는 사람/회고용 표기이고,
-- booth_id는 참가사 이력과 정확히 조인하는 키다. 기존 원장은 그대로 보존한다.
alter table user_signal_log
  add column if not exists booth_id text references booth(id) on delete set null;
create index if not exists user_signal_log_user_booth_created_idx
  on user_signal_log (user_id, booth_id, created_at desc)
  where booth_id is not null;

-- 로미와 운영 도구가 읽는 참가사별 판단 투영. 현재 회차의 부스 평가를 원본으로
-- 유지하며, 공동 부스의 co_exhibitor에는 자동으로 점수를 전파하지 않는다.
create or replace view user_exhibitor_judgment_history as
select
  note.user_id,
  exhibitor.id as exhibitor_id,
  exhibitor.canonical_name as exhibitor_name,
  exhibition.id as exhibition_id,
  exhibition.name as exhibition_name,
  exhibition.start_date,
  participant.id as participant_id,
  participant.display_name as participant_name,
  booth.id as booth_id,
  booth.code as booth_code,
  note.interest,
  note.verdict,
  note.visited_at,
  note.updated_at
from booth_note note
join booth on booth.id = note.booth_id
join booth_participant assignment
  on assignment.booth_id = booth.id and assignment.role = 'primary'
join exhibition_participant participant on participant.id = assignment.participant_id
join exhibitor on exhibitor.id = participant.exhibitor_id
join exhibition on exhibition.id = booth.exhibition_id;

alter table exhibitor enable row level security;
alter table exhibition_participant enable row level security;
alter table booth_participant enable row level security;

drop policy if exists "public read exhibitor" on exhibitor;
create policy "public read exhibitor" on exhibitor for select using (true);
drop policy if exists "public read exhibition_participant" on exhibition_participant;
create policy "public read exhibition_participant" on exhibition_participant for select using (true);
drop policy if exists "public read booth_participant" on booth_participant;
create policy "public read booth_participant" on booth_participant for select using (true);
