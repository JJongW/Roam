-- ---------------------------------------------------------------------------
-- 0073: 브랜드 연결 후보를 참가(출전) 단위로 (정규화 STEP 3의 후보 몫)
--
-- 결정(Ted, 2026-11-17): 브랜드 → 참가(부스 없이) → 부스(나중, 선택).
-- 다시(Ted, 2026-11-20): "부스는 별개라니까. 해당 박람회에 해당 참가자가 들어온다는 게 떴으면
-- 일단 참가로 넣어 놓고, 이후에 배치도에서 들어왔냐 안 왔냐만 보고 그 값만 빼면 되는 거를 왜 자꾸
-- 어렵게 하지?"
-- 기록: docs/decisions/2026-11-20_브랜드-대조는-참가-단위.md
-- 설계: docs/decisions/2026-11-17_스키마-정규화-감사.md 7절 STEP 3("후보 participant_id + unique,
-- booth_id 선택")을 쓴다. 다만 participant_id not null은 지금 걸지 않는다(아래 4).
--
-- "같은 브랜드인가요?"는 그 박람회의 그 참가에 대한 판단이다. 0057은 booth_id를 not null로 둬서
-- 부스 없는 참가(brands.v1, 새해 준비상점 0부스)는 후보가 될 수 없었다.
--
-- 더하기와 느슨하게 하기만 한다. 지금 main 코드(부스 후보, onConflict booth_id,exhibitor_id)는
-- 이 파일을 돌린 뒤에도 그대로 돈다:
--   1. booth_id not null 풀기                  부스는 붙이는 정보일 뿐
--   2. participant_id 칸(0062에 있음, 없으면 만든다)
--   3. 채우기: 부스의 대표 배정 출전(0063 5와 같은 쿼리, 멱등)
--   4. 넣을 때 participant_id가 비면 부스의 대표 배정으로 채우는 트리거(옛 코드 경로도 참가 단위가 된다)
--   5. 같은 출전, 같은 대상 브랜드 짝이 둘이면 하나만 남긴다(나머지는 participant_id를 비우고, 대기였으면 superseded)
--   6. unique(participant_id, exhibitor_id)     부스 없이 짝 하나. null은 서로 안 겹친다
--   7. check: 출전이나 부스 중 하나는 있다
-- unique(booth_id, exhibitor_id)(0057)는 그대로 둔다. booth_id가 null인 행끼리는 겹치지 않는다.
--
-- participant_id not null을 안 거는 이유: 대표 배정이 없는 부스로 후보를 넣는 옛 경로가 있으면
-- 그 넣기가 실패한다. 7의 check로 "아무것도 안 가리키는 후보"만 막는다. 운영에서 아래 확인 쿼리가
-- 0이 된 뒤 STEP 4에서 not null로 바꾼다.
--
-- 적용 전 확인(읽기만, SQL Editor):
--   select count(*) from exhibitor_link_candidate;                                  -- 2026-11-17 33행
--   select count(*) from exhibitor_link_candidate where participant_id is null;     -- 0063 뒤 0이어야
--   select participant_id, exhibitor_id, count(*) from exhibitor_link_candidate
--    where participant_id is not null group by 1, 2 having count(*) > 1;            -- 5가 정리할 짝
--
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약. 전체를 한 번에 실행한다.
-- 이 파일을 먼저 돌리고 코드(PR)를 머지한다. 코드가 먼저 나가면 부스 없는 후보 넣기와
-- onConflict participant_id,exhibitor_id가 실패한다.
-- 되돌리기는 파일 맨 아래.
-- ---------------------------------------------------------------------------
begin;

-- 1. 부스는 선택.
alter table exhibitor_link_candidate alter column booth_id drop not null;

-- 2. 출전 칸(0062가 이미 만들었다. 0062 없이 돌려도 되게).
alter table exhibitor_link_candidate
  add column if not exists participant_id text references exhibition_participant(id) on delete cascade;

-- 3. 비어 있는 출전을 부스의 대표 배정으로. 같은 짝(출전, 대상)이 이미 있거나 이번에 둘 이상 생기면
--    하나만 채운다(판단한 것 먼저, 그다음 먼저 생긴 것). 다시 돌려도 6의 unique에 걸리지 않는다.
with fill as (
  select distinct on (bp.participant_id, l.exhibitor_id) l.id, bp.participant_id
    from exhibitor_link_candidate l
    join booth_participant bp on bp.booth_id = l.booth_id and bp.role = 'primary'
   where l.participant_id is null
     and not exists (
       select 1 from exhibitor_link_candidate o
        where o.participant_id = bp.participant_id and o.exhibitor_id = l.exhibitor_id
     )
   order by bp.participant_id, l.exhibitor_id, (l.status in ('approved', 'rejected')) desc, l.created_at, l.id
)
update exhibitor_link_candidate l
   set participant_id = f.participant_id
  from fill f
 where f.id = l.id;

-- 4. 넣거나 부스를 바꿀 때 출전이 비면 대표 배정으로 채운다. 그 출전에 같은 대상 짝이 이미 있으면
--    채우지 않는다(부스로만 가리키는 행으로 남는다). 옛 코드의 onConflict booth_id,exhibitor_id 넣기가
--    출전 unique에 걸려 실패하지 않게 하려는 것이다.
create or replace function exhibitor_link_candidate_fill_participant()
returns trigger
language plpgsql
as $$
declare
  pid text;
begin
  if new.participant_id is null and new.booth_id is not null then
    select bp.participant_id into pid
      from booth_participant bp
     where bp.booth_id = new.booth_id and bp.role = 'primary'
     limit 1;
    if pid is not null and not exists (
      select 1 from exhibitor_link_candidate o
       where o.participant_id = pid and o.exhibitor_id = new.exhibitor_id and o.id <> new.id
    ) then
      new.participant_id := pid;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists exhibitor_link_candidate_fill_participant on exhibitor_link_candidate;
create trigger exhibitor_link_candidate_fill_participant
  before insert or update of booth_id, participant_id on exhibitor_link_candidate
  for each row execute function exhibitor_link_candidate_fill_participant();

-- 5. 같은 출전과 같은 대상의 짝이 둘 이상이면(한 출전에 대표 부스가 여럿일 때) 하나만 남긴다.
--    남기는 쪽: 판단한 것(approved, rejected) 먼저, 그다음 먼저 생긴 것. 나머지는 지우지 않고
--    participant_id를 비우고(부스로는 계속 가리킨다) 대기였으면 superseded로 둔다.
--    트리거가 비운 칸을 다시 채우지 않게 잠깐 끈다.
alter table exhibitor_link_candidate disable trigger exhibitor_link_candidate_fill_participant;
with ranked as (
  select id,
         row_number() over (
           partition by participant_id, exhibitor_id
           order by (status in ('approved', 'rejected')) desc, created_at, id
         ) as rn
    from exhibitor_link_candidate
   where participant_id is not null
)
update exhibitor_link_candidate l
   set participant_id = null,
       status = case when l.status = 'pending' then 'superseded' else l.status end,
       reviewed_at = coalesce(l.reviewed_at, now())
  from ranked r
 where r.id = l.id and r.rn > 1;
--    3에서 채우지 못한(같은 짝이 이미 있어) 대기 행도 정리한다. 화면은 부스로 출전을 찾아 같은 짝을 두 번 보여 준다.
update exhibitor_link_candidate l
   set status = 'superseded',
       reviewed_at = coalesce(l.reviewed_at, now())
  from booth_participant bp
 where l.participant_id is null
   and l.status = 'pending'
   and bp.booth_id = l.booth_id
   and bp.role = 'primary'
   and exists (
     select 1 from exhibitor_link_candidate o
      where o.participant_id = bp.participant_id and o.exhibitor_id = l.exhibitor_id
   );
alter table exhibitor_link_candidate enable trigger exhibitor_link_candidate_fill_participant;

-- 6. 출전 단위 짝 하나. PostgREST onConflict에 쓰도록 평범한 unique로 둔다.
do $$ begin
  alter table exhibitor_link_candidate
    add constraint exhibitor_link_candidate_participant_exhibitor_uniq unique (participant_id, exhibitor_id);
exception when duplicate_object or duplicate_table then null; end $$;

-- 7. 출전이나 부스 중 하나는 가리킨다.
do $$ begin
  alter table exhibitor_link_candidate
    add constraint exhibitor_link_candidate_subject_chk check (participant_id is not null or booth_id is not null);
exception when duplicate_object then null; end $$;

create index if not exists exhibitor_link_candidate_participant_idx
  on exhibitor_link_candidate (participant_id) where participant_id is not null;

commit;

-- 확인:
--   select count(*) from exhibitor_link_candidate where participant_id is null and status = 'pending';  -- 0이어야
--   select is_nullable from information_schema.columns
--    where table_name = 'exhibitor_link_candidate' and column_name = 'booth_id';                       -- YES
--
-- 되돌리기(booth_id가 null인 행이 생겼으면 먼저 떠 두고 지운다. not null로 되돌릴 수 없다):
--   delete from exhibitor_link_candidate where booth_id is null;
--   alter table exhibitor_link_candidate drop constraint if exists exhibitor_link_candidate_subject_chk;
--   alter table exhibitor_link_candidate drop constraint if exists exhibitor_link_candidate_participant_exhibitor_uniq;
--   drop index if exists exhibitor_link_candidate_participant_idx;
--   drop trigger if exists exhibitor_link_candidate_fill_participant on exhibitor_link_candidate;
--   drop function if exists exhibitor_link_candidate_fill_participant();
--   alter table exhibitor_link_candidate alter column booth_id set not null;
-- 5에서 비운 participant_id는 3을 다시 돌리면 채워지지만 그러면 6에 걸린다 — 되돌릴 때는 그대로 둔다.
