-- ---------------------------------------------------------------------------
-- 0060: 공개 설문 응답 (/survey)
--
-- 박람회 방문객에게 지도·관람 방식을 묻는 공개 설문. 로그인 없이 답한다 —
-- 링크를 눌러 들어온 사람이 계정을 만들 이유가 없다(결정:
-- docs/decisions/2026-10-16_공개-설문-페이지.md).
--
-- 한 사람 한 행: respondent_id 는 설문 전용 쿠키(roam_survey)의 무작위 id다.
-- 다시 보내면 덮어쓴다. 질문 정의는 코드(src/lib/survey/questions.ts)에 있고,
-- 질문을 바꾸면 survey_id 를 바꾼다.
--
--   survey_id     : 설문 회차(SURVEY_ID)
--   respondent_id : 설문 쿠키 id
--   answers       : { 질문 key: 값 | 값[] }
--   comment       : 자유 의견(선택)
--   duration_ms   : 페이지를 연 뒤 "답변 보내기"를 누르기까지 걸린 시간(브라우저가 잰다)
--
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약.
-- ---------------------------------------------------------------------------

create table if not exists survey_response (
  survey_id     text not null,
  respondent_id text not null,
  answers       jsonb not null,
  comment       text,
  duration_ms   integer check (duration_ms >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  primary key (survey_id, respondent_id)
);

create index if not exists survey_response_recent_idx
  on survey_response (survey_id, updated_at desc);

alter table survey_response enable row level security;
-- 서비스 롤 전용. 정책이 없으니 방문객 키(anon)로는 읽고 쓸 수 없다 —
-- 쓰기는 입력을 검증하는 /api/survey, 읽기는 /admin/survey 뿐이다.
