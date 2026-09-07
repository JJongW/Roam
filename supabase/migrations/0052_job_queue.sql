-- 0052: job — 워커 잡 큐.
--
-- 왜 필요한가: 자동 초안이 지금 admin이 부르는 Vercel 라우트다. 파일럿 실측이
-- **10부스에 49초**였고 Vercel 함수 상한(기본 60s)에 이미 닿아 있다. SIF 914부스는
-- 같은 속도로 75분이라 라우트로는 아예 불가능하다. 오래 도는 일을 맥미니로 옮기려면
-- 그 사이에 큐가 있어야 한다.
--
-- 왜 테이블인가(설계 §4): 잡 큐 하나 때문에 Redis·SQS를 얹으면 운영할 것이 하나
-- 더 는다. Supabase가 이미 진실의 원천이고, 잡 수는 하루 수십 건 규모다.
--
-- ⚠️ **claim은 원자적이어야 한다.** PostgREST의 select→update 두 번으로는 워커
-- 둘이 같은 잡을 집는다. `for update skip locked`가 그걸 막는 유일한 방법이고,
-- 그건 SQL 함수로만 가능해서 아래 claim_job을 둔다.

create table if not exists job (
  id           text primary key,
  -- enrichment_draft | metrics_rollup | insight_write | ...
  -- text다. 새 워커가 생겨도 마이그레이션이 필요 없다(change_log와 같은 판단).
  type         text not null,
  payload      jsonb not null default '{}'::jsonb,
  -- queued | running | done | failed
  status       text not null default 'queued',
  -- 이 시각 전에는 안 집는다. 재시도 백오프와 예약 실행이 같은 필드를 쓴다.
  run_after    timestamptz not null default now(),
  attempts     int not null default 0,
  max_attempts int not null default 3,
  -- 마지막 실패 이유. 조용히 사라지면 워커가 왜 안 도는지 알 방법이 없다.
  last_error   text,
  -- 누가 집었나(호스트명 등). 죽은 워커가 들고 있는 잡을 찾을 때 쓴다.
  claimed_by   text,
  claimed_at   timestamptz,
  -- 진행 표시. 오래 도는 잡이 살아 있는지 보려면 이게 움직여야 한다.
  progress     jsonb not null default '{}'::jsonb,
  result       jsonb,
  created_at   timestamptz not null default now(),
  finished_at  timestamptz
);

-- 워커의 주 질의: 돌 준비된 잡을 오래된 순으로.
create index if not exists job_ready_idx
  on job (status, run_after) where status = 'queued';
create index if not exists job_recent_idx on job (created_at desc);

/**
 * 잡 하나를 원자적으로 집는다. 없으면 아무 행도 안 돌려준다.
 *
 * `skip locked`가 핵심이다 — 워커 여럿이 동시에 불러도 서로 다른 잡을 집고,
 * 잠긴 행에서 기다리지 않는다. 이게 없으면 워커를 늘리는 순간 같은 잡이 두 번
 * 돈다(초안이면 Gemini 요금이 두 배가 되고 중복 candidate가 쌓인다).
 */
create or replace function claim_job(p_worker text, p_types text[] default null)
returns setof job
language plpgsql
as $$
begin
  return query
  update job
     set status     = 'running',
         claimed_by = p_worker,
         claimed_at = now(),
         attempts   = attempts + 1
   where id = (
     select j.id from job j
      where j.status = 'queued'
        and j.run_after <= now()
        and (p_types is null or j.type = any(p_types))
      order by j.run_after, j.created_at
      for update skip locked
      limit 1
   )
  returning *;
end $$;

comment on function claim_job is
  '큐에서 잡 하나를 원자적으로 집는다. for update skip locked — 워커 여럿이 같은 잡을 두 번 돌지 않게.';

/** 죽은 워커가 들고 있는 잡 회수. 맥미니는 집 컴퓨터라 정전·재부팅에 노출된다
 *  (설계 §4) — 그때 running으로 굳은 잡을 다시 큐로 돌린다. */
create or replace function requeue_stale_jobs(p_older_than interval default '30 minutes')
returns int
language plpgsql
as $$
declare n int;
begin
  update job
     set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
         last_error = coalesce(last_error, '워커가 응답 없이 사라짐(회수됨)'),
         claimed_by = null
   where status = 'running'
     and claimed_at < now() - p_older_than;
  get diagnostics n = row_count;
  return n;
end $$;
