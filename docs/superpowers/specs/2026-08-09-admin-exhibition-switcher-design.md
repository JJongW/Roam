# Admin 전시 선택기 Design

**Goal:** `/admin/booths`·`/admin/events`·`/admin/analytics`·`/admin/timeline`이 전부
`pickAdminExhibition`로 "지금 관리해야 할 전시" 하나만 자동으로 보여주고 바꿀 방법이
없던 것을, 운영자가 직접 다른 전시(예: sif-2026)로 전환해서 볼 수 있게 한다.

**Architecture:** admin 레이아웃에 전시 선택 드롭다운(`ExhibitionSwitcher`)을 하나
두고, 선택값을 쿠키에 저장한다. 전시 스코프 페이지 4곳은 쿠키값이 있으면 그 전시를,
없거나 무효(삭제된 전시 id 등)하면 기존 `pickAdminExhibition` 자동 선택으로 폴백하는
새 순수 함수 `resolveAdminExhibition`을 통해 "지금 볼 전시"를 정한다.

## Global Constraints

- 서버 액션 안 씀 — 이 코드베이스는 전부 API 라우트(Zod 검증, `{ data } | { error }`
  envelope)라 이 관례를 따른다.
- 새 API 라우트는 `requireAdmin()` 게이트 필수(기존 admin 라우트 관례).
- `pickAdminExhibition`(`src/lib/exhibition/current.ts`) 자체는 수정하지 않고
  `resolveAdminExhibition`이 내부에서 폴백으로 재사용한다 — 기존 동작(쿠키 없을 때)
  100% 보존.
- `/admin/accounts`·`/admin/design-system`은 전시 스코프가 아니므로 안 건드린다.
- 새 컴포넌트는 기존 `Select`(`src/components/ui/select.tsx`, shadcn/Radix 기반) 위에
  얹는다 — 새 UI 프리미티브 안 만듦.
- 쿠키는 `ADMIN_COOKIE`(운영자 게이트)와 같은 옵션(`httpOnly`, `sameSite: "lax"`,
  `path: "/"`)으로 설정한다.

---

## 섹션 A — `resolveAdminExhibition` (순수 함수)

`src/lib/exhibition/current.ts`에 추가:

```ts
/**
 * 쿠키에 저장된 전시 id가 있고 실제 목록에 존재하면 그 전시를, 없거나
 * 무효하면(삭제된 전시 등) 기존 pickAdminExhibition 자동 선택으로 폴백한다.
 */
export function resolveAdminExhibition(
  exhibitions: Exhibition[],
  cookieExhibitionId: string | undefined,
  today: string,
): Exhibition | undefined {
  if (cookieExhibitionId) {
    const found = exhibitions.find((e) => e.id === cookieExhibitionId);
    if (found) return found;
  }
  return pickAdminExhibition(exhibitions, today);
}
```

## 섹션 B — 쿠키 읽기/쓰기

- 쿠키 이름: `admin_exhibition_id`.
- 쓰기: `POST /api/admin/exhibition-selection`
  - body: `{ exhibitionId: string }`(Zod, `src/lib/schemas`에 스키마 추가)
  - `requireAdmin()` 게이트.
  - 존재하지 않는 `exhibitionId`면 400(`repo.getExhibition`으로 유효성 확인할 필요
    없이, 어차피 `resolveAdminExhibition`이 목록에 없으면 폴백하므로 — 여기서는
    형식만 검증하고 저장, 유효성 판단은 각 페이지의 `resolveAdminExhibition`이 맡음).
  - `cookies().set("admin_exhibition_id", exhibitionId, { httpOnly: true, sameSite:
    "lax", path: "/", maxAge: 60 * 60 * 24 * 30 })`.
  - 204 응답.
- 읽기: 각 소비처(섹션 D)가 `(await cookies()).get("admin_exhibition_id")?.value`를
  직접 읽어 `resolveAdminExhibition`에 넘긴다 — 별도 헬퍼로 감싸지 않음(호출부 4곳뿐,
  YAGNI).

## 섹션 C — `ExhibitionSwitcher` + 레이아웃 배치

- `src/components/admin/exhibition-switcher.tsx`(client component):
  - props: `exhibitions: Exhibition[]`, `selectedId: string | undefined`.
  - `Select`(`src/components/ui/select.tsx`) 사용, 옵션은 `exhibitions`를
    `startDate` 내림차순 정렬 후 `{name}` 표시.
  - 변경 시 `POST /api/admin/exhibition-selection` 호출(`api.post`) →
    성공하면 `router.refresh()`(Next `useRouter`)로 현재 페이지를 새 전시 기준
    재렌더.
- `src/app/admin/layout.tsx`: `<main>` 내부, `{children}` 위에 삽입. 레이아웃이
  이미 `listExhibitions`를 안 부르므로 새로 호출 필요(`repo.listExhibitions({limit:
  100})`) — booths/events/analytics 각 페이지가 이미 하는 동일 호출과 중복되지만,
  요청 단위 캐시(`repositories/cached.ts`의 관례상 exhibition **단건** 캐시만 있고
  목록 캐시는 없음 — 기존에도 각 페이지가 개별 호출 중이라 이번 스코프에서 새로
  캐시를 만들지 않는다, 별도 이슈로 남김)로 인해 페이지당 한 번씩 이미 나가던
  호출이 레이아웃에서 한 번 더 나가는 정도.
- 전시가 0개면 스위처 자체를 숨긴다(빈 셀렉트 방지).

## 섹션 D — 소비처 4곳 교체

`pickAdminExhibition(exhibitions, todayISO())` 호출부를 전부 아래 패턴으로 교체:

```ts
import { cookies } from "next/headers";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
// ...
const cookieId = (await cookies()).get("admin_exhibition_id")?.value;
const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
```

대상: `src/app/admin/booths/page.tsx`, `src/app/admin/events/page.tsx`,
`src/app/admin/analytics/page.tsx`, `src/app/api/admin/timeline/route.ts`.

---

## 에러 처리 / 엣지 케이스

- 쿠키에 삭제된 전시 id가 남아있음 → `resolveAdminExhibition`이 목록에서 못 찾고
  자동 폴백(정상 동작, 별도 처리 불필요).
- 전시가 하나도 없음 → 기존과 동일하게 각 페이지가 "전시가 없습니다" 표시, 스위처는
  숨김.
- mock 모드(Supabase 키 없음) → 쿠키 매커니즘은 Supabase와 무관하게 동일하게 동작
  (Next.js 쿠키, `ORGANIZER_CODE`처럼 mock에서만 다르게 동작하지 않음).
- `/api/admin/exhibition-selection`에 존재하지 않는 형식의 `exhibitionId`(빈 문자열
  등) → Zod에서 400.

## 테스트

- `resolveAdminExhibition` — 유닛 테스트(쿠키값 있고 유효/무효/없음 3가지 케이스),
  기존 `src/lib/exhibition/current.test.ts`에 추가.
- `/api/admin/exhibition-selection` — `requireAdmin()` 미충족 401, 정상 저장 시 204
  + `Set-Cookie` 헤더 통합 테스트.
- UI는 `tsc`/`eslint`/`vitest run` 회귀 + 수동 확인(라이트 모드만): 스위처로 다른
  전시 선택 → 부스/이벤트/분석/타임라인 4곳 전부 그 전시로 바뀌는지, 새로고침해도
  유지되는지, 시크릿창(쿠키 없음)에서 기존 자동 선택과 동일한지.
