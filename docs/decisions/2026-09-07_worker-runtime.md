# 워커 런타임 — 잡 큐 + Compose

2026-09-07. 근거: `docs/admin-automation-architecture.md` §4·§6.

## 왜 지금인가

자동 초안이 admin이 부르는 Vercel 라우트다. **파일럿 실측이 10부스에 49초**였고
Vercel 함수 상한(기본 60초)에 이미 닿아 있다. SIF 914부스는 같은 속도로 75분이라
라우트로는 아예 불가능하다. 오래 도는 일을 맥미니로 옮기려면 그 사이에 큐가 있어야
한다.

`insight-writer`·`health-doctor`(Phase 5의 나머지)도 같은 이유로 이게 먼저다.

## 구조

```
Vercel (Next)                Supabase                  맥미니 (Compose)
  /admin → enqueueJob  ──▶   job 테이블   ◀── claim_job ── worker × N
                              ▲                              │
                              └────── finishJob ─────────────┘
```

- **잡 큐를 테이블로.** Redis·SQS를 얹으면 운영할 것이 하나 더 는다. Supabase가
  이미 진실의 원천이고 잡은 하루 수십 건 규모다.
- **`claim_job`은 SQL 함수여야 한다.** PostgREST의 select→update 두 번으로 집으면
  워커 둘이 같은 잡을 집는다. `for update skip locked`는 함수 안에서만 가능하고,
  이게 없으면 워커를 늘리는 순간 초안이 두 번 돌아 Gemini 요금이 배가 된다.
- **`requeue_stale_jobs`** — 맥미니는 집 컴퓨터라 정전·재부팅에 노출된다(§4).
  running으로 굳은 잡을 회수한다.
- **`type`·`source`는 text.** 새 워커가 생겨도 마이그레이션이 필요 없다
  (change_log와 같은 판단).

## 라우트와 워커가 같은 함수를 쓴다

`src/lib/enrichment/run-draft.ts`. 작은 배치(10 이하)는 admin이 바로 돌리고 큰
배치는 큐로 넘어가지만, **실행 로직은 하나다** — 실행 위치가 달라도 규칙이 갈리면
안 된다. 라우트가 상한을 넘는 요청을 받으면 자동으로 큐로 돌린다.

## Next 밖에서 도는 대가

워커는 맨 Node라 Next가 해주던 둘을 대신해야 한다.

- `@/` 별칭 → `worker/vite.config.ts`의 resolve.alias
- `server-only` → Next의 가상 모듈이라 Node엔 없다. 빈 모듈로 바꾼다.
  **코드에서 그 import를 빼지 않는 이유**는 그게 클라이언트 번들 유입을 막는
  장치여서다 — 워커 편의로 앱의 안전장치를 없앨 수는 없다.
- `.env` → dotenv를 워커 진입점에서 먼저 부른다(env를 읽는 모듈보다 앞서야 한다).

`vite-node`로 소스를 그대로 돌린다. 배치 프로세스라 번들링해서 얻을 게 없고,
앱과 같은 파일을 쓰는 게 "규칙이 갈리지 않는다"는 조건을 지키기 쉽다.

## 컨테이너를 늘리지 않는 이유

`drafter` 하나만 띄운다. `claim_job`이 원자적이라 중복 처리는 안 되지만, 초안은
Gemini 호출이라 **병렬이 이득인 일이 아니다** — 같은 전시를 동시에 긁어 요금만
배가 된다. 종류가 다른 워커가 생기면 그때 컨테이너를 나눈다(`WORKER_TYPES`).

## 운영

```
docker compose up -d --build     # 시작
docker compose logs -f drafter   # 로그(JSON 한 줄씩)
docker compose stop              # 집어둔 잡을 마치고 멈춘다
npm run worker                   # 컨테이너 없이 로컬에서
npm run worker:once              # 잡 하나만 처리하고 종료(손 확인용)
```

## 워커는 서비스 롤로 읽는다

첫 잡이 **`cookies` was called outside a request scope**로 죽었다. 저장소의
`db()`가 요청 컨텍스트(쿠키·Bearer)를 전제하는데 워커엔 요청이 없다.

`ROAM_WORKER=1`이면 `db()`가 서비스 롤을 쓴다. **우회가 아니라 사실을 적는 것이다** —
워커는 신뢰된 백엔드 프로세스이고, 쓰기는 이미 서비스 롤로 하고 있었다. 읽기만
사용자 컨텍스트를 요구할 이유가 없다.

(이때 재시도 백오프가 의도대로 작동해 잡이 `queued`로 돌아간 것도 같이 확인됐다.)

## 죽은 잡 회수는 Vercel이 부른다

`GET /api/cron/requeue-stale` + `vercel.json`의 15분 주기.

맥미니는 집 컴퓨터라 정전·재부팅에 노출된다. 그때 `running`으로 굳은 잡을 누군가
되돌려야 하는데, **그 판단을 맥미니가 하면 맥미니가 죽었을 때 아무도 안 한다.**
항상 떠 있는 쪽이 해야 한다.

## 아직 안 한 것

- admin의 잡 현황 화면. 지금은 `listJobs`만 있다.
