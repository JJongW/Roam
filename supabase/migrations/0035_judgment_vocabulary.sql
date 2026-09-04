-- 판단 어휘 재설계: booth_note.status(4값)+retro(2값) → interest/verdict/visited_at(직교 3필드)
-- interest·verdict는 서로 독립이다 — "꼭 갈래로 찍어둔 곳에 가봤더니 아니었다"를
-- 표현하려면 한 컬럼이 아니라 두 컬럼이어야 한다.

alter table booth_note
  add column if not exists interest text
    check (interest in ('must', 'curious', 'pass')),
  add column if not exists verdict text
    check (verdict in ('good', 'ok', 'bad')),
  add column if not exists visited_at timestamptz;

-- 기존 데이터 이관 — 없는 판정을 지어내지 않는다. visited+retro 없음은
-- verdict를 비워두고 visited_at만 채운다 → 회고 되묻기 큐로 자연히 들어간다.
update booth_note set interest = 'curious' where status = 'interested';
update booth_note set interest = 'curious' where status = 'later';
update booth_note set interest = 'pass' where status = 'skipped';
update booth_note set verdict = 'good', visited_at = updated_at
  where status = 'visited' and retro = 'liked';
update booth_note set verdict = 'bad', visited_at = updated_at
  where status = 'visited' and retro = 'disliked';
update booth_note set visited_at = updated_at
  where status = 'visited' and retro is null;

-- status/retro에 이름 붙은 체크 제약이 있다면(0029/0031 즈음 추가됐을 가능성) 컬럼
-- 삭제 전에 먼저 지워야 한다 — 로컬엔 스키마가 없어(gitignore) 제약 이름을 알 수
-- 없다. 실행 전 Supabase 대시보드에서 booth_note 정의를 확인해 필요하면
-- `alter table booth_note drop constraint if exists <이름>;`을 이 자리에 추가할 것.
alter table booth_note
  drop column if exists status,
  drop column if exists retro;
