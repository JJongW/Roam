-- ---------------------------------------------------------------------------
-- 0058: 인스타 댓글 → 자동 DM 중복 방지
--
-- Roam 인스타 게시물에 키워드("지도" 등)를 댓글로 달면 그 사람에게 자동으로
-- DM(Private Reply)을 보낸다(규칙: src/lib/instagram/rules.ts, 결정:
-- docs/decisions/2026-10-14_instagram-comment-auto-dm.md).
--
-- Meta 웹훅은 200을 늦게 받으면 **같은 이벤트를 다시 보낸다.** 그런데 Private
-- Reply는 **댓글당 한 번뿐**이다. 그래서 발송 전에 댓글 ID로 이 테이블에 먼저
-- 행을 넣어(선점) 두 번째 이벤트는 primary key 충돌로 건너뛴다. 발송이 실패하면
-- failed로 남기고 자동 재시도하지 않는다 — 애매하면 안 보내는 쪽이 낫다.
--
--   comment_id : 인스타 댓글 ID(선점 키)
--   rule_id    : 매칭된 규칙(DmRule.id) — 회차별 성과를 본다
--   status     : claimed(선점, 발송 전) | sent | failed
--   error      : failed일 때 Graph API 오류 메시지
--
-- 적용은 손으로 한다(Supabase SQL Editor) — CLAUDE.md 규약.
-- ---------------------------------------------------------------------------

create table if not exists ig_comment_dm (
  comment_id    text primary key,
  media_id      text,
  from_id       text,
  from_username text,
  rule_id       text not null,
  status        text not null default 'claimed'
                check (status in ('claimed', 'sent', 'failed')),
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 규칙별 성과(몇 명이 댓글을 달았고 몇 건이 갔나)를 최근 순으로 본다.
create index if not exists ig_comment_dm_rule_idx
  on ig_comment_dm (rule_id, created_at desc);

alter table ig_comment_dm enable row level security;
-- 서비스 롤 전용. 정책이 없으니 방문객 키(anon)로는 읽고 쓸 수 없다.
