-- ---------------------------------------------------------------------------
-- 0070: 아티클 — 브랜드 아티클 초안과 승인
--
-- 결정 기록: docs/decisions/2026-11-19_브랜드-아티클-초안-파이프라인.md
-- 2026-11-19 Ted: "초안을 작성해서 Slack에 지금 이미 보고하고 있는 내용 하단에 포함시켜서
-- 매일 보고해줘", "그럼 내가 슬랙에서 승인할게".
--
-- 한 행 = 아티클 한 편. 워커(검수 적체 점검, kr.roam.sweep)가 하루 한 편을 draft로 만들고,
-- Ted가 슬랙 링크나 버튼으로 승인(approved)하거나 반려(rejected)한다. 사용자에게 나가는 것은
-- approved뿐이다(공개 API GET /api/articles). 승인 없이는 아무것도 공개되지 않는다.
--
--   kind            : brand_intro(브랜드 하나 소개) | fair_roundup(박람회 참가 브랜드 모음)
--   body            : 블록 배열. paragraph와 heading은 Roam이 쓴 문장(해요체 게이트를 지남),
--                     quote는 브랜드나 주최 측이 쓴 원문 그대로(고치지 않음, 출처 id가 붙음)
--   sources         : 본문이 기대는 출처 목록. 확인된 칸(collected, reviewed, artist_confirmed),
--                     행사 행, 참가 사실, 부스만 들어간다
--   gate            : 저장 직전 게이트 결과. ok=false인 판본은 저장하지 않는다(fail closed)
--   subject_key     : 'brand:<exhibitor_id>' | 'fair:<exhibition_id>'. 같은 주제를 두 번 내지 않는다
--   generated_for   : 초안을 만든 날(KST). 점검이 같은 날 두 번 돌아도 한 편만 만든다
--   decided_by/at   : 승인하거나 반려한 사람(관리자 이메일 또는 slack:<user id>)과 시각
--   reject_reason   : 반려 이유(선택). 반려한 주제는 다음 초안에서 뺀다
--
-- 왜 exhibitor_ids, exhibition_ids가 text[]인가: 앱과 iOS가 "이 브랜드를 다룬 아티클"을
-- 찾을 때 배열 포함 조회(cs)를 쓴다. FK는 배열에 걸 수 없어 코드가 보장한다(생성기가
-- 저장소에서 읽은 id만 넣는다). 브랜드가 합쳐지면 옛 id가 남을 수 있다 — 화면은 없는 id를 건너뛴다.
--
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약. 새 표라 기존 데이터를 바꾸지 않는다.
-- ---------------------------------------------------------------------------

create table if not exists article (
  id             text primary key,
  kind           text not null check (kind in ('brand_intro', 'fair_roundup')),
  status         text not null default 'draft' check (status in ('draft', 'approved', 'rejected')),
  title          text not null check (length(title) between 1 and 120),
  excerpt        text not null check (length(excerpt) between 1 and 400),
  body           jsonb not null check (jsonb_typeof(body) = 'array'),
  sources        jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  gate           jsonb not null,
  subject_key    text not null,
  exhibitor_ids  text[] not null default '{}',
  exhibition_ids text[] not null default '{}',
  generated_for  date not null,
  decided_by     text,
  decided_at     timestamptz,
  reject_reason  text check (reject_reason is null or length(reject_reason) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- 결정된 행엔 누가, 언제가 있어야 한다. draft엔 없어야 한다.
  check ((status = 'draft') = (decided_at is null)),
  -- 게이트를 통과하지 못한 판본은 저장하지 않는다(코드가 먼저 막고, 여기서 한 번 더).
  check ((gate ->> 'ok')::boolean is true)
);

-- 같은 주제의 열린(draft, approved) 아티클은 하나뿐. 반려한 주제는 남겨 두고 생성기가 피한다.
create unique index if not exists article_open_subject_uq
  on article (subject_key) where status in ('draft', 'approved');
-- 슬랙 보고와 관리자 목록: 상태별 최신순.
create index if not exists article_status_created_idx
  on article (status, created_at desc);
-- "이 브랜드를 다룬 아티클"(앱, iOS).
create index if not exists article_exhibitor_ids_idx
  on article using gin (exhibitor_ids);

alter table article enable row level security;
-- 서비스 롤 전용(정책 없음). 방문객 키(anon)로는 읽고 쓸 수 없다 —
-- 공개 읽기는 GET /api/articles가 서비스 롤로 approved만 골라 준다.
