-- 부스 반응 네 가지를 전부 계정에 남긴다.
--
-- 지금까지 booth_note.status는 visited|skipped만 받았고, 끌림(interested)·나중에
-- (later)는 브라우저 localStorage에만 있었다. 그래서:
--  (a) 폰을 바꾸거나 재로그인하면 지도에서 끌림·나중에 색이 통째로 사라졌고,
--  (b) 끌림을 누르면 클라이언트가 status:null을 보내서 서버의 visited/skipped가
--      날아갔다. upsertNote(src/lib/supabase/repository.ts)는 상태가 없고 메모·
--      사진도 비면 행을 아예 지우므로, 메모 없는 부스에선 '가봄' 기록이 행째로
--      삭제됐다. 메모가 있으면 메모는 남고 상태만 사라졌다. 복구는 불가능하다.
--
-- (운영의 status null 11행은 이 경로가 아니라 전부 메모만 적어둔 정상 데이터다 —
--  "아트북 구매", "캐리커쳐 해줌" 같은. 확인하고 적는다.)
--
-- status는 enum 타입이 아니라 text다(PostgREST 스키마로 확인). 값 제한이 체크
-- 제약으로 걸려 있을 수 있으므로, status를 언급하는 체크 제약이 있으면 이름과
-- 무관하게 걷어내고 넓힌 제약을 다시 건다. 제약이 원래 없었어도 안전하고, 두 번
-- 돌려도 결과가 같다(아래에서 추가하는 제약도 다음 실행 때 같이 걷힌다).
--
-- ⚠️ 이 마이그레이션은 앱 배포보다 **먼저** 실행해야 한다. 안 그러면 새 앱이 보내는
--    interested/later가 제약에 걸려 저장이 실패한다(쓰기 게이트가 예외를 던진다).
-- ⚠️ 반응 종류를 늘리면 이 제약도 같이 넓혀야 한다. 값 목록의 짝은
--    BoothStatus(src/lib/types/index.ts)와 boothNoteInputSchema(src/lib/schemas)다.

do $$
declare
  c record;
begin
  for c in
    select conname, pg_get_constraintdef(oid) as def
      from pg_constraint
     where conrelid = 'public.booth_note'::regclass
       and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%status%'
  loop
    -- 손으로 돌리는 스크립트다. 이름을 안 보고 지우는 만큼 무엇을 지웠는지는
    -- 반드시 눈에 보여야 한다(status를 함께 언급하는 다른 규칙일 수도 있으므로).
    raise notice '기존 제약 삭제: % — %', c.conname, c.def;
    execute format('alter table public.booth_note drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.booth_note
  add constraint booth_note_status_check
  check (
    status is null
    or status in ('visited', 'skipped', 'interested', 'later')
  );

-- 확인용(실행 후 눈으로 보면 된다):
--   select status, count(*) from booth_note group by status order by 2 desc;
