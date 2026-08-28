# Roam

전시·박람회를 **같이 걷는 관람 동행자**. 방문객이 부스를 발견하고, 왜 그 부스가 자기에게
맞는지 판단하고, 본 것을 기록하도록 돕는다. + 주최자용 관리·분석 콘솔.

특정 전시 전용이 아니다 — 현재 들어 있는 서울국제도서전(SIBF)·서울일러스트레이션페어(SIF)·
하우스아카이브 데이터는 시드다. 전시 추가는 **코드 변경 없이 데이터로** 가능하다.

> **반응할수록 정확해져** — 로미가 미리 아는 건 전시고, 사용자는 아직 모른다.
> 그래서 추천은 정답이 아니라 가설이고, 반응하면 갱신된다.
> 브랜드·보이스 기준은 [`docs/brand/`](docs/brand/README.md).

**Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui · Supabase ·
Google Gemini.** 디자인 톤: Apple HIG + Toss (미니멀·반응형·라이트/다크).

## 시작하기

```bash
npm install
npm run dev          # http://localhost:3000
```

환경변수 없이도 뜬다. Supabase 키가 없으면 in-memory **MockRepository**(`src/lib/mock/seed.ts`)로
전시 데모가 그대로 돌아간다. 실제 DB를 쓰려면 `.env.example` → `.env.local`에 Supabase 키를 채우면
자동으로 Postgres로 전환된다 (`GET /api/health`가 활성 `mode`를 보고한다).

mock 강제 미리보기:

```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev
```

## 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 서빙 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (엔진·피드·메모리·저장소·컴포넌트) |
| `npm run test:watch` | Vitest watch |
| `npm run lint` | ESLint |

변경 후에는 **세 개를 모두** 돌린다: `npm run typecheck` · `npm test` · `npm run lint`.

## 아키텍처

- **데이터 레이어** `src/lib/repositories` — `Repository` 인터페이스 + 두 구현
  (`MockRepository`, `SupabaseRepository`), 런타임 `getRepository()`가 선택. UI·API·검증·테스트가
  인프라 없이 동작하고 env로 Postgres로 넘어간다.
  요청 단위 캐시는 `repositories/cached.ts`의 `getExhibitionCached`(React `cache`).
- **추천 엔진** `src/lib/engine` — 순수·결정론. `scoring.ts`(부스 점수) + `service.ts`
  (`rankForExhibition`). I/O 없음, 유닛 테스트 완비.
- **피드** `src/lib/feed` — `curate.ts`(안정·낯선·모험 믹스, **LLM 없음**) ·
  `grounding.ts`(근거 카드) · `cue.ts`(실시간 판단 큐) · `rhythm.ts`(6칸 결정 큐).
- **메모리** `src/lib/memory` — 신호 → 브레인 증류(`distill.ts`), 확신도(`confidence.ts`),
  회고(`reflect-questions.ts` · `retro-outcomes.ts`).
- **API** `src/app/api/*` Route Handlers — 모든 입력 Zod 검증(`src/lib/schemas`),
  일관된 `{ data } | { error }` 봉투(`src/lib/api/http.ts`).
- **상태** — 서버가 진실(RSC + Route Handlers). zustand는 휘발성 클라 상태만
  (지도 뷰포트·컴패니언·UI).
- **DB** — `supabase/migrations/000N_*.sql`. ⚠️ `supabase/`는 gitignore라 레포에 올라가지 않는다.

### 쓰기 규약 (중요)

PostgREST는 실패해도 예외를 던지지 않는다. `supabase/repository.ts`의 모든 쓰기는
`wrote()`/`maybeWrote()`(도메인, 실패=throw) 또는 `loggedWrite()`(텔레메트리, 실패=에러 로그)를
**반드시** 통과해야 한다. 빠뜨리면 FK 위반·스키마 드리프트가 201 성공으로 위장되고 로그에도
남지 않는다 (2026-07-27 감사에서 북마크·커뮤니티 전량 유실로 확인).

## 방문객 플로우

**로그인 필수.** 방문객 앱 전체가 인증 게이트 뒤에 있다 (`src/proxy.ts` — `roam_user` 쿠키가
없으면 `/login?next=`로 307). 예외는 `/login`·`/auth`·`/admin`·`/api`·정적 파일.

```
로그인(닉네임 또는 Google OAuth)
  → 전시 홈 (가치 온보딩 + 관심 피드 + 근거 카드)
  → 인터랙티브 지도 (온사이트 공간 참조)
  → 부스 상세 (리뷰·이벤트·웰컴키트)
  → 노트·커뮤니티
  → "오늘 관람 마치기" (회고 → 기억 쓰기)
```

**판단 어휘** — 관람 전(피드) `꼭 갈래 · 끌려 · 패스`, 관람 중·후(지도·상세)
`좋았어 · 그냥그랬어 · 아니었어`. 예측과 결과가 직교해야 로미가 자기 추천이 틀렸다는 걸 배운다.

> ⚠️ 과거의 동선 제품(`route.ts` 시간예산 그리디, `navigation.ts` 턴바이턴)은 **없다.**
> 피드로 대체되며 제거됐다. 지도는 중심 인터페이스가 아니라 부가 서비스다.

## LLM 사용

- **탭(대화 턴)엔 LLM 금지** → 즉답(로컬 템플릿). 피드 큐레이션도 순수 결정론이다.
- 실제 Gemini 호출처는 4곳 — `/api/ai/booth-summary` · `/api/ai/community-summary` ·
  `/api/ai/screenshot` · `/api/exhibitions/[slug]/keywords`.
- **`thinkingConfig.thinkingBudget=0` 필수.** gemini-2.5-flash는 thinking이 기본 ON이라
  빼면 8~15초+로 느려져 전부 결정론 폴백된다.
- 래퍼 `src/lib/ai/gemini.ts` — `generateJSON`/`generateText`/`generateGrounded`, server-only,
  재시도 + 모델 폴백, `hasGemini` 게이트.

## 주최자 콘솔

`/admin` — 전시·부스·이벤트·대기 관리 + 분석 대시보드(히트맵·인기 부스·동선 흐름·퍼널·
이슈 모니터링·계정 상세). 자체 코드 게이트 + 이메일 allowlist.

## 문서

| 위치 | 내용 |
|---|---|
| [`docs/brand/`](docs/brand/README.md) | **브랜드북** — 정체·로미 캐릭터·보이스&톤·비주얼·네이밍 |
| `docs/decisions/` | 결정 기록 (변경마다 `/why`로 이유를 남긴다) |
| `docs/superpowers/plans` · `specs` | 기능별 설계·구현 계획 |
| `docs/booth-enrichment.md` | 부스 근거 데이터 수동 입력 양식 |
| `.claude/plans/` | `architecture.md` · `erd.md` · `api-spec.md` |
| `CLAUDE.md` | 코드베이스 작업 규약 (에이전트용) |

## 알아둘 상태

- 부스 근거 데이터(enrichment): 기본 필드 **79/256(31%)**, 저작 필드는 **16개 부스**.
  근거 카드는 저작 필드가 없으면 런타임 겹침으로 파생된다 — 채워질수록 품질이 오른다.
- 크로스-전시 기억(L4): 설계 확정, **미구현**.
- 푸시(FCM): 키 미설정으로 **비활성**.
- 리뷰·커뮤니티 포스트는 아직 `visitor_session.id` 기준이라 계정에 묶이지 않는다 (미해결, P1).
- `node scripts/gen-seed.mjs`는 **실행 불가** — `supabase/`가 gitignore라 레포에 없다.
