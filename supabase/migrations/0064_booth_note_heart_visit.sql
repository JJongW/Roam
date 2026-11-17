-- ---------------------------------------------------------------------------
-- 0064: booth_note에 하트 시각(hearted_at)과 평가 시각(verdict_at)을 더한다.
--
-- 왜:
-- - 하트 하나(2026-11-07 Ted 결정). 옛 interest(must, curious, pass)는 지우지 않는다 —
--   지금 현장에 있는 iOS 앱이 이 칸을 읽고 Supabase에 바로 쓴다. 새 칸을 더하기만 한다.
--   must, curious는 하트, pass는 하트 없음으로 읽는다(화면 설계서 README 헤더 기본값 1).
-- - 다녀왔어요를 평가와 따로 저장(2026-11-17 Ted 결정). visited_at은 이미 있다. 평가를
--   고칠 때 방문 날을 덮지 않으려면 평가 시각이 따로 있어야 한다(설계서 C D-2).
--
-- 컬럼만 더하므로 기존 웹, iOS 읽기와 쓰기는 그대로 돈다. 단, 이 브랜치의 서버 코드는
-- hearted_at, verdict_at을 쓰므로 **배포 전에 이 파일을 먼저 적용**한다.
--
-- 트리거: 옛 iOS는 서버를 거치지 않고 interest만 고친다. 그때도 hearted_at이 맞게
-- 따라가도록, 이번 쓰기가 hearted_at을 직접 건드리지 않았으면 interest에서 계산한다.
-- 서버(lib/notes/apply.ts)는 둘을 함께 쓰므로 트리거가 덮지 않는다.
-- ---------------------------------------------------------------------------

alter table booth_note
  add column if not exists hearted_at timestamptz,
  add column if not exists verdict_at timestamptz;

comment on column booth_note.hearted_at is
  '하트를 남긴 시각(2026-11-07 하트 하나). null = 하트 없음. 옛 interest must, curious와 함께 맞춰 둔다.';
comment on column booth_note.verdict_at is
  '평가를 남긴 시각. visited_at(다녀왔어요)과 따로다(2026-11-17).';

create or replace function booth_note_sync_heart()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.hearted_at is null and new.interest in ('must', 'curious') then
      new.hearted_at := now();
    end if;
  elsif new.interest is distinct from old.interest
        and new.hearted_at is not distinct from old.hearted_at then
    -- interest만 바뀐 쓰기(옛 클라이언트) → 하트를 거기에 맞춘다.
    new.hearted_at := case
      when new.interest in ('must', 'curious') then coalesce(old.hearted_at, now())
      else null
    end;
  end if;
  return new;
end;
$$;

drop trigger if exists booth_note_sync_heart on booth_note;
create trigger booth_note_sync_heart
  before insert or update on booth_note
  for each row execute function booth_note_sync_heart();
