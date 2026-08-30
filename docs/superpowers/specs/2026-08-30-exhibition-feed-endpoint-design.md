# 전시 피드 API 엔드포인트 설계

**날짜**: 2026-08-30
**범위**: iOS 네이티브 앱(`Roam-ios`)이 전시 홈 화면에서 관심 피드를 보여줄 수 있게,
기존 `curateFeed`(`src/lib/feed/curate.ts`)를 JSON으로 감싸는 신규 GET 엔드포인트
하나를 추가한다. **새 큐레이션 로직 없음** — 이미 테스트돼 있는 `curateFeed`를 그대로
호출해 직렬화만 한다.

**전제**: `docs/superpowers/specs/2026-08-27-roam-ios-split-design.md`에서 확정된
"iOS는 클라이언트 전용, 백엔드는 이 레포를 그대로 원격 API로 쓴다" 원칙을 따른다.
iOS 쪽 소비(전시 홈 화면·관심 피드 UI)는 `Roam-ios` 레포의 별도 스펙에서 다룬다.

## 1. 배경

웹의 `/exhibitions/[slug]` 페이지(`src/app/(visitor)/exhibitions/[slug]/page.tsx`)는
서버 컴포넌트 안에서 `curateFeed(slug, user?.id ?? null, rhythm, locale, brain)`를
직접 호출해 렌더링한다 — API 라우트를 거치지 않는다. iOS는 서버 컴포넌트를 가질 수
없으니, 같은 결과를 JSON으로 받을 REST 엔드포인트가 필요하다.

`curateFeed`는 `userId=null`이면 개인화 없이 인기순 랭킹만 돈다(주석 "userId=null
(비로그인) — 개인화 없이 인기순만" 참고, `curate.ts:132`) — 로그인 세션이 없는
호출도 이미 지원 대상이다. iOS의 첫 소비자는 로그인 붙기 전(`Roam-ios`의 Auth
작업은 의도적으로 맨 마지막 순서)이라 이 비로그인 경로부터 쓴다.

## 2. 엔드포인트

### `GET /api/exhibitions/[slug]/feed`

**쿼리 파라미터**:
- `rhythm`(optional): `"focus" | "light" | "rest"`. 없거나 유효하지 않으면
  `DEFAULT_RHYTHM`(`src/lib/feed/rhythm.ts`)로 폴백 — 웹 페이지의
  `isRhythm(rhythmRaw) ? rhythmRaw : DEFAULT_RHYTHM` 로직 그대로.

**처리**:
```ts
import { getCurrentUser } from "@/lib/api/session";
import { curateFeed } from "@/lib/feed/curate";
import { readBrain } from "@/lib/memory/service";
import { getI18n } from "@/lib/i18n/server";
import { DEFAULT_RHYTHM, isRhythm } from "@/lib/feed/rhythm";
import { getExhibitionCached } from "@/lib/repositories/cached";
import { notFound, ok } from "@/lib/api/http";

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const detail = await getExhibitionCached(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");

  const { searchParams } = new URL(req.url);
  const rhythmRaw = searchParams.get("rhythm") ?? undefined;
  const rhythm = isRhythm(rhythmRaw) ? rhythmRaw : DEFAULT_RHYTHM;

  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const brain = user ? await readBrain(user.id) : undefined;
  const items = await curateFeed(slug, user?.id ?? null, rhythm, locale, brain);

  return ok(items);
}
```

이건 페이지 컴포넌트(`page.tsx:70-76`)가 이미 하는 호출을 그대로 옮긴 것 —
`getExhibitionCached`로 404 처리하는 것까지 동일 패턴(`getExhibitionCached`는
같은 요청 캐시를 타므로 페이지·엔드포인트가 각자 호출해도 실제 조회는 한 번).

**응답**: `{ data: FeedItem[] }`(기존 `ok()` 헬퍼 — `{data: T}` 봉투, `Roam-ios`의
`APIClient`가 이미 벗기는 그 한 겹과 동일). `FeedItem`(`curate.ts:80-90`)·
`Grounding`(`grounding.ts:26-35`)은 이미 존재하는 인터페이스라 새 타입 없음 —
`Booth`(`src/lib/types/index.ts:95-133`)를 포함해 전부 JSON 직렬화 가능한 plain
object라 `NextResponse.json`이 그대로 처리한다.

**로그인 여부는 세션 쿠키로 판단**(`getCurrentUser()`) — 별도 인증 파라미터 없음.
iOS가 아직 로그인을 안 붙였으니 항상 `user === null` 경로(비로그인 인기순)를 타는
것으로 시작하지만, 나중에 iOS가 세션 쿠키를 보내게 되면(Auth 스펙에서 다룰 일)
같은 엔드포인트가 자동으로 개인화 경로를 탄다 — 이 엔드포인트 자체는 로그인 여부에
불가지론적이라 나중에 손댈 일이 없다.

## 3. 범위 밖

- 재큐레이션(iOS의 "다시 고르기" 버튼)은 같은 엔드포인트를 다시 호출하는 것으로
  충분 — 서버 쪽 캐시나 별도 파라미터 없음.
- `POST /api/me/notes/[boothId]`(판단 기록)는 이미 존재 — 이 스펙에서 안 건드림.
- 로그인 세션 판별 로직 자체(`getCurrentUser`)는 기존 구현 그대로, 이 스펙은
  그걸 호출만 한다.

## 4. 검증

- `npx vitest run` — 신규 라우트 테스트: (a) 비로그인 호출이 `curateFeed(slug, null, ...)`을
  호출하는지(개인화 없이 인기순), (b) `rhythm` 쿼리파라미터가 없거나 잘못된 값이면
  `DEFAULT_RHYTHM`으로 폴백하는지, (c) 존재하지 않는 slug면 404, (d) 응답이 `{data: [...]}`
  봉투 모양인지. `curateFeed` 자체의 랭킹 로직은 이미 `curate.test.ts`가 커버 —
  이 라우트 테스트는 "올바른 인자로 올바르게 호출하고 봉투로 감싸는지"만 확인한다.
- `npx tsc --noEmit`, `npx eslint src/app/api/exhibitions/[slug]/feed/`.
