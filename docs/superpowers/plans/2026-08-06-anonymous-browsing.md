# 비로그인 브라우징 + 온보딩 타이밍 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 없이 전시 상세·지도·부스 상세를 둘러볼 수 있게 게이트를 다시 열되,
로미(반응 즉답·개인화 피드·컴패니언 바)는 로그인 계정에서만 동작하게 한다. 로그인
하면 그동안 로컬에 쌓인 반응·온보딩 답변이 한꺼번에 서버에 반영된다.

**Architecture:** `proxy.ts`에 정확한 경로 패턴 3개만 공개로 추가한다. 대부분의
컴포넌트는 이미 "비로그인이면 로컬만" 동작하도록 짜여 있던 무계정 설계 시절 잔재를
그대로 쓰고, 로미가 "말하는" 지점(반응 즉답, 개인화 피드)만 로그인 여부로 명시적으로
막는다. 앱 온보딩 재노출 조건은 비로그인=`localStorage`, 로그인=서버 신호
(`brain.interests` 존재 여부) 이원화로 바꾸고, `(visitor)/layout.tsx`로 옮겨 홈을
안 거치고 전시로 바로 들어와도 뜨게 한다.

**Tech Stack:** Next.js 16 middleware(`proxy.ts`), zustand(auth·companion·visit
스토어), 기존 i18n 딕셔너리, vitest.

## Global Constraints

- 로미는 로그인한 사용자에게만 "동작"한다: 반응 즉답(`say()`), 개인화 피드
  (`curateFeed`), 하단 상주 컴패니언 바(이미 `!user`면 안 뜸, 손댈 것 없음).
- 비로그인 반응 버튼은 시각적으로는 토글되지만(로컬 `useVisitStore`) 서버 저장·로미
  반응은 없다.
- "저장 안 됨" 안내는 **전시당(세션 기준) 첫 반응 1회만** — `sessionStorage` 키
  `roam-promptlogin-seen-<exhibitionSlug>`로 판정.
- 로그인 시 로컬에 쌓인 부스 반응(`useVisitStore.records`) + 온보딩 답변
  (`PENDING_VALUES_KEY`)을 전부 서버에 소급 반영. 반영된 게 있으면 완료 토스트 1회.
- `promptLogin()`류 토스트 카피는 기존 코드 관례대로 **하드코딩 한국어 문자열**이다
  (`i18n` 딕셔너리를 안 거침 — `bookmark-button.tsx`의 기존 `promptLogin(...)` 호출과
  동일한 패턴). 반면 서버 컴포넌트(전시 홈)에서 렌더되는 카피는 기존 관례대로
  `t()`로 딕셔너리를 거친다.
- 앱 온보딩(`AppOnboardingGate`)을 완료하면(건너뛰기 아님) 지금 보고 있는 전시의
  `ValueOnboarding`으로 자동으로 이어진다.
- 그대로 로그인 필수로 남는 것: `/exhibitions/[slug]/notes`,
  `/exhibitions/[slug]/community`, 마이페이지·북마크류 — 정확한 패턴 매치라 자동으로
  게이트 걸림, 별도 처리 불필요.

참고 스펙: `docs/superpowers/specs/2026-08-06-anonymous-browsing-design.md`

---

### Task 1: 게이트 범위 넓히기 (`proxy.ts`)

**Files:**
- Modify: `src/proxy.ts`
- Test: `src/proxy.test.ts` (신규)

**Interfaces:**
- Produces: `export const PUBLIC_PATH_PATTERNS: RegExp[]` — 테스트가 직접 참조.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/proxy.test.ts` 새로 작성:

```ts
import { describe, expect, it } from "vitest";
import { PUBLIC_PATH_PATTERNS } from "@/proxy";

function isPublic(pathname: string): boolean {
  return PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname));
}

describe("PUBLIC_PATH_PATTERNS", () => {
  it("전시 상세를 공개로 허용", () => {
    expect(isPublic("/exhibitions/sibf-2026")).toBe(true);
  });

  it("지도를 공개로 허용", () => {
    expect(isPublic("/exhibitions/sibf-2026/map")).toBe(true);
  });

  it("부스 상세를 공개로 허용", () => {
    expect(isPublic("/booths/b_a1406")).toBe(true);
  });

  it("메모장은 여전히 막는다(더 깊은 경로)", () => {
    expect(isPublic("/exhibitions/sibf-2026/notes")).toBe(false);
  });

  it("커뮤니티는 여전히 막는다", () => {
    expect(isPublic("/exhibitions/sibf-2026/community")).toBe(false);
  });

  it("전시 목록 자체(/exhibitions)는 이 패턴에 안 걸린다", () => {
    expect(isPublic("/exhibitions")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/proxy.test.ts`
Expected: FAIL — `PUBLIC_PATH_PATTERNS` is not exported from `@/proxy`

- [ ] **Step 3: `proxy.ts`에 패턴 추가**

`src/proxy.ts` 전체를 아래로 교체:

```ts
import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE } from "@/lib/constants";

/**
 * Global auth gate. Personalized/interactive visitor pages require a signed-in
 * identity (`roam_user`) — unauthenticated visitors are bounced to /login with a
 * `next` param so they return to where they were headed after logging in.
 *
 * The home page (`/`) is intentionally public: it's the landing that shows the
 * open exhibitions (some info) plus why signing in helps. A hard wall on the
 * very first screen felt like an arbitrary account gate; login is framed as
 * memory/continuity, so browsing the shelf without it should be possible.
 *
 * 전시 상세·지도·부스 상세도 같은 이유로 공개다 — 정보 열람은 계정 벽 없이 되고,
 * 로미(반응 즉답·개인화 피드·컴패니언 바)만 로그인 계정에서 동작한다(컴포넌트
 * 레벨에서 막음, 여기선 라우트만 연다). 더 깊은 경로(메모장·커뮤니티 등)는 이
 * 패턴에 안 걸려 그대로 로그인 필수다.
 *
 * Exempt prefixes:
 *  - /login  : the gate itself
 *  - /auth   : OAuth callback (issues the cookie)
 *  - /admin  : organizer console has its own code gate (roam_admin), a separate
 *              persona from visitor accounts — don't double-gate it here
 *
 * API routes and static assets are excluded via the matcher below (APIs still
 * validate their own session/cookie server-side; the login endpoints must stay
 * reachable so the gate is passable).
 */
const EXEMPT_PREFIXES = ["/login", "/auth", "/admin"];
/** Public pages reachable without an identity (exact match). */
const PUBLIC_PATHS = ["/"];
/** 정확한 패턴 매치 — 하위 경로(메모장·커뮤니티 등)는 자동으로 안 걸린다. */
export const PUBLIC_PATH_PATTERNS = [
  /^\/exhibitions\/[^/]+$/,
  /^\/exhibitions\/[^/]+\/map$/,
  /^\/booths\/[^/]+$/,
];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname)) ||
    EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  if (req.cookies.get(USER_COOKIE)?.value) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on every path except API routes, Next internals, and files with an
  // extension (static assets). Those never need the visitor gate.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\..*).*)",
  ],
};
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/proxy.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/proxy.ts src/proxy.test.ts
git commit -m "feat(auth): 전시 상세·지도·부스 상세를 비로그인 공개로 전환"
```

---

### Task 2: 인증 스토어 — 온보딩 서버 신호 + 소급 반영

**Files:**
- Modify: `src/app/api/auth/me/route.ts`
- Modify: `src/app/api/auth/login/route.ts`
- Modify: `src/lib/stores/auth.ts`

**Interfaces:**
- Produces: `useAuthStore((s) => s.needsOnboarding): boolean`,
  `useAuthStore((s) => s.setNeedsOnboarding): (v: boolean) => void` — Task 5가 씀.
- Produces: `export function promptLoginOncePerExhibition(exhibitionSlug: string): void`
  (`src/lib/stores/auth.ts`) — Task 3이 씀.

- [ ] **Step 1: `/api/auth/me`가 `needsOnboarding` 계산해 반환**

`src/app/api/auth/me/route.ts` 전체를 아래로 교체:

```ts
import { ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { readBrain } from "@/lib/memory/service";

export async function GET() {
  const user = await getCurrentUser();
  const needsOnboarding = user
    ? (await readBrain(user.id)).interests.length === 0
    : false;
  return ok({ user, needsOnboarding });
}
```

- [ ] **Step 2: `/api/auth/login`도 동일하게 반환**

`src/app/api/auth/login/route.ts` 전체를 아래로 교체:

```ts
import { getRepository } from "@/lib/repositories";
import {
  created,
  fail,
  getUserId,
  parseBody,
  setUserCookie,
} from "@/lib/api/http";
import { loginSchema } from "@/lib/schemas";
import { readBrain } from "@/lib/memory/service";

/**
 * Nickname login. The nickname is a unique public key:
 * - free → create the account and sign in
 * - taken by you (same cookie) → re-issue cookie, sign in
 * - taken by someone else → 409 (cannot be reused)
 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.res;
  const { nickname } = parsed.data;
  const repo = await getRepository();

  const existing = await repo.getUserByNickname(nickname);
  if (existing) {
    const currentId = await getUserId();
    if (existing.id !== currentId) {
      return fail("CONFLICT", "이미 사용 중인 닉네임이에요", {
        nickname: ["이미 사용 중인 닉네임이에요"],
      });
    }
    await setUserCookie(existing.id);
    const needsOnboarding = (await readBrain(existing.id)).interests.length === 0;
    return created({ user: existing, needsOnboarding });
  }

  const user = await repo.createUser(nickname);
  await setUserCookie(user.id);
  // 새 계정은 브레인이 비어 있으니 항상 온보딩이 필요하다(브레인 조회 불필요).
  return created({ user, needsOnboarding: true });
}
```

- [ ] **Step 3: `useAuthStore`에 `needsOnboarding` + 소급 반영 추가**

`src/lib/stores/auth.ts` 전체를 아래로 교체:

```ts
"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import type { BoothNote, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  /** false until the initial /api/auth/me check resolves. */
  ready: boolean;
  /** Controls the global login sheet. */
  loginOpen: boolean;
  /** 로그인 계정에 아직 취향(브레인 관심)이 없으면 true — 앱 온보딩을 다시 띄울지
   *  판정하는 서버 신호(AppOnboardingGate가 씀). 비로그인은 이 값 대신
   *  localStorage로 따로 판정한다(계정이 없어 서버에 물을 게 없음). */
  needsOnboarding: boolean;
  setNeedsOnboarding: (v: boolean) => void;
  openLogin: () => void;
  closeLogin: () => void;
  refresh: () => Promise<void>;
  login: (nickname: string) => Promise<void>;
  logout: () => Promise<void>;
}

/** Pull the signed-in user's booth notes into the local visit cache. */
async function loadNotes() {
  try {
    const { data } = await api.get<{ data: BoothNote[] }>("/api/me/notes");
    useVisitStore.getState().setFromNotes(data);
  } catch {
    /* ignore — notes are non-critical */
  }
}

/** 로그인 전 공개 온보딩에서 고른 취향(localStorage)을 로그인 시 브레인에 올린다.
 *  반환값: 실제로 올릴 게 있었는지(소급 반영 완료 토스트 표시 여부 판단용). */
export const PENDING_VALUES_KEY = "roam-pending-values";
async function syncPendingValues(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(PENDING_VALUES_KEY);
  if (!raw) return false;
  localStorage.removeItem(PENDING_VALUES_KEY);
  try {
    const values = JSON.parse(raw);
    if (Array.isArray(values) && values.length) {
      await api.post("/api/me/values", { values });
      return true;
    }
  } catch {
    /* 실패해도 무시 — 관람 반응으로 다시 쌓인다 */
  }
  return false;
}

/** 비로그인 동안 로컬(zustand)에만 남아 있던 부스 반응을 로그인 시 서버에 소급
 *  반영한다. 반환값: 실제로 반영한 게 있었는지. */
async function syncPendingReactions(): Promise<boolean> {
  const boothIds = Object.keys(useVisitStore.getState().records);
  if (boothIds.length === 0) return false;
  await Promise.all(boothIds.map((id) => pushNote(id)));
  return true;
}

/** 온보딩 답변 + 부스 반응을 함께 소급 반영하고, 뭔가 반영됐으면 완료 토스트를
 *  한 번 띄운다. login()과 refresh()(OAuth 콜백 포함) 양쪽에서 호출한다. */
async function syncAndAnnounce() {
  const [syncedValues, syncedReactions] = await Promise.all([
    syncPendingValues(),
    syncPendingReactions(),
  ]);
  if (syncedValues || syncedReactions) {
    toast("아까 둘러본 것도 다 반영했어. 이제부터 제대로 골라줄게.");
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  loginOpen: false,
  needsOnboarding: false,
  setNeedsOnboarding: (v) => set({ needsOnboarding: v }),
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),

  refresh: async () => {
    try {
      const { user, needsOnboarding } = await api.get<{
        user: User | null;
        needsOnboarding: boolean;
      }>("/api/auth/me");
      set({ user, ready: true, needsOnboarding });
      // Signed in → merge the server's notes on top. Signed out → keep whatever
      // is in the local cache: anonymous visitors save memos/visits locally and
      // must not lose them on reload. Only an explicit logout clears.
      if (user) {
        await syncAndAnnounce();
        await loadNotes();
      }
    } catch {
      set({ ready: true });
    }
  },

  login: async (nickname: string) => {
    try {
      const { user, needsOnboarding } = await api.post<{
        user: User;
        needsOnboarding: boolean;
      }>("/api/auth/login", { nickname });
      set({ user, loginOpen: false, needsOnboarding });
      await syncAndAnnounce();
      await loadNotes();
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      throw new ApiClientError(
        { code: "INTERNAL", message: "로그인에 실패했어요" },
        500,
      );
    }
  },

  logout: async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    set({ user: null, needsOnboarding: false });
    useVisitStore.getState().clear();
  },
}));

/**
 * Gate for signed-in-only actions (save / share / bookmark). Instead of
 * silently failing or jumping straight into the login sheet, surface a toast
 * that explains why and offers a one-tap path to the login screen.
 */
export function promptLogin(message = "로그인이 필요해요") {
  toast(message, {
    action: {
      label: "로그인",
      onClick: () => useAuthStore.getState().openLogin(),
    },
  });
}

/** 비로그인 반응에서 전시당(세션 기준) 첫 반응 1회만 저장 안내를 띄운다.
 *  sessionStorage라 탭을 닫으면 리셋된다 — 영구로 기억할 필요는 없다(다음 방문 때
 *  한 번 더 알려줘도 무해하다). */
export function promptLoginOncePerExhibition(exhibitionSlug: string) {
  if (typeof window === "undefined") return;
  const key = `roam-promptlogin-seen-${exhibitionSlug}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  promptLogin("지금 누른 건 로미가 기억 못 해 — 로그인하면 이제부터 다 기억할게");
}
```

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/app/api/auth/me/route.ts src/app/api/auth/login/route.ts src/lib/stores/auth.ts
git commit -m "feat(auth): 온보딩 재노출을 서버 신호로, 로그인 시 로컬 반응 소급 반영"
```

---

### Task 3: 반응 버튼 — 로그인 여부로 로미 동작 갈라치기

**Files:**
- Modify: `src/components/feed/reaction-bar.tsx`
- Modify: `src/components/map/map-view.tsx`
- Modify: `src/components/feed/interest-feed.tsx`
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx` (한 줄만 — `<InterestFeed>`
  호출에 `slug` 전달. CTA 분기는 Task 4)

**Interfaces:**
- Consumes: `promptLoginOncePerExhibition`(Task 2)
- Produces: `<ReactionBar ... exhibitionSlug={string} />`(신규 필수 prop),
  `<InterestFeed ... slug={string} />`(신규 필수 prop) — Task 4가 이 prop을 그대로
  쓴다.

- [ ] **Step 1: `reaction-bar.tsx`가 로그인 여부로 갈라지도록 교체**

`src/components/feed/reaction-bar.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { Check, Clock3, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisitStore, pushNote, type BoothStatus } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useAuthStore, promptLoginOncePerExhibition } from "@/lib/stores/auth";
import { useT } from "@/lib/i18n/provider";
import { buildReactionLine, type ReactionKey } from "@/lib/companion/reaction-line";

/**
 * 부스 반응 버튼(끌림/나중에/별로/이미봄). 스스로 갈지 말지 판단한 결과를 상태로 남기면
 * 지도 부스 색이 칠해지고(초록=가봄, 노랑=끌림), 서버가 그 상태 변화를 신호로 적재해
 * 브레인에 반영한다. companion-reframe §7.5 — 명령이 아니라 사용자의 반응을 받는다.
 *
 * 비로그인이어도 버튼은 그대로 토글된다(로컬 visitStore) — 다만 로미는 "동작"하지
 * 않는다: 즉답이 없고(promptLoginOncePerExhibition만 전시당 1회) 서버 저장도 안 된다
 * (pushNote가 401을 조용히 삼킴). 로그인하면 그동안 쌓인 반응이 소급 반영된다
 * (auth.ts의 syncPendingReactions).
 */
const REACTIONS: {
  key: ReactionKey;
  status: BoothStatus;
  Icon: typeof Heart;
}[] = [
  { key: "interested", status: "interested", Icon: Heart },
  { key: "later", status: "later", Icon: Clock3 },
  { key: "skip", status: "skipped", Icon: X },
  { key: "seen", status: "visited", Icon: Check },
];

/** 저장된 상태 → 초기 선택 버튼 키. */
function keyForStatus(s: BoothStatus | undefined): string | null {
  if (s === "visited") return "seen";
  if (s === "skipped") return "skip";
  if (s === "interested") return "interested";
  if (s === "later") return "later";
  return null;
}

export function ReactionBar({
  boothId,
  boothName,
  interestSlugs,
  categoryLabel,
  exhibitionSlug,
}: {
  boothId: string;
  /** 로미가 이 부스를 이름으로 부르게 한다. 없으면 이름 없는 판본으로 떨어진다. */
  boothName?: string;
  /** boothValueSlugs(booth) — 가치 축 slug. 반응 즉답이 브레인 관심(interests)과
   *  매칭하는 데 쓴다(reaction-line.ts). brain.interests는 이 축으로 쌓인다. */
  interestSlugs: string[];
  /** 발화에 얹을 구체적 분야 이름(카테고리) — 가치 이름은 절대 쓰지 않는다. */
  categoryLabel: string | undefined;
  /** 비로그인일 때 "저장 안 됨" 안내를 전시당 1회로 제한하는 데 쓴다. */
  exhibitionSlug: string;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const storeStatus = useVisitStore((s) => s.records[boothId]?.status);
  const setStatus = useVisitStore((s) => s.setStatus);
  const say = useCompanionStore((s) => s.say);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const interests = useCompanionStore((s) => s.interests);
  // 눌린 버튼은 스토어에서 파생한다 — 복사본을 두면 부스가 바뀌어도 앞 부스의 상태가
  // 남아, 실제로는 아무 반응도 없는 부스에 버튼이 눌린 채로 보인다(지도에서 부스를
  // 옮겨 다닐 때 실제로 그랬다). 진실은 visitStore 한 곳뿐이다.
  const picked = keyForStatus(storeStatus);

  function react(r: (typeof REACTIONS)[number]) {
    const isSame = picked === r.key;
    setStatus(boothId, isSame ? null : r.status);
    if (!isSame) {
      // 로미 즉답 — 로그인했을 때만. 비로그인은 로미가 "동작"하지 않는다(전시당
      // 1회만 저장 안내).
      if (user) {
        say(buildReactionLine(r.key, interestSlugs, boothName, categoryLabel, interests, t));
      } else {
        promptLoginOncePerExhibition(exhibitionSlug);
      }
    }
    // 네 상태 모두 서버 노트로 동기화 → 폰을 바꾸거나 재로그인해도 지도 색이 남는다.
    // 신호 적재도 이 요청 하나가 겸한다(notes 라우트가 상태를 보고 기록) — 예전처럼
    // /api/me/signal을 따로 치면 가봄·별로만 신호가 두 번 쌓인다.
    //
    // 취향 정확도는 서버 응답을 그대로 반영한다 — 예전엔 클라이언트가 감쇠 곡선으로
    // 낙관적 bump를 했는데, 서버 공식과 어긋나 새로고침하면 값이 오르내렸다. 취소
    // (isSame) 때도 pushNote는 항상 나간다 — 반응을 지우면 판정도 같이 지워지므로
    // 정확도가 내려갈 수 있고, 그것도 서버가 계산해 알려준다. 비로그인이면 401로
    // 조용히 실패한다(로컬 캐시는 유지, syncPendingReactions가 로그인 시 다시 시도).
    const prevJudged = useCompanionStore.getState().tasteJudged;
    void pushNote(boothId).then((taste) => {
      if (!taste) return;
      setTaste(taste.judgedCount, taste.pct);
      // "감 잡았다" — 판정 5개를 막 넘기는 순간에만, 1회.
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        say(t("companion.tasteInsight"));
      }
    });
  }

  return (
    <div className="flex gap-1.5">
      {REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => react(r)}
          aria-pressed={picked === r.key}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold active:opacity-70",
            picked === r.key
              ? "border-primary bg-accent/60 text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          <r.Icon className="size-3.5" aria-hidden />
          {t(`reaction.${r.key}`)}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 지도 호출부에 `exhibitionSlug` 전달**

`src/components/map/map-view.tsx`에서 `<ReactionBar` 호출부(기존):

```tsx
              <ReactionBar
                boothId={selected.id}
                boothName={selected.name}
                interestSlugs={boothValueSlugs(selected)}
                categoryLabel={selectedCat?.name}
              />
```

교체:

```tsx
              <ReactionBar
                boothId={selected.id}
                boothName={selected.name}
                interestSlugs={boothValueSlugs(selected)}
                categoryLabel={selectedCat?.name}
                exhibitionSlug={detail.exhibition.slug}
              />
```

- [ ] **Step 3: `interest-feed.tsx`에 `slug` prop 추가 + `exhibitionSlug` 전달**

`src/components/feed/interest-feed.tsx`의 컴포넌트 props 정의(기존):

```tsx
export function InterestFeed({
  items,
  categoryById,
  memoryLine,
}: {
  items: FeedItem[];
  categoryById: Record<string, Category>;
  /** 기억 발화 — 브레인 상위 관심 기반 인사. 없으면 기본 문구. */
  memoryLine?: string;
}) {
```

교체:

```tsx
export function InterestFeed({
  items,
  categoryById,
  memoryLine,
  slug,
}: {
  items: FeedItem[];
  categoryById: Record<string, Category>;
  /** 기억 발화 — 브레인 상위 관심 기반 인사. 없으면 기본 문구. */
  memoryLine?: string;
  /** 반응 시 "저장 안 됨" 안내를 전시당 1회로 제한하는 데 쓴다(ReactionBar). */
  slug: string;
}) {
```

같은 파일의 `<ReactionBar` 호출부(기존):

```tsx
                <ReactionBar
                  boothId={booth.id}
                  boothName={booth.name}
                  interestSlugs={boothValueSlugs(booth)}
                  categoryLabel={categoryById[booth.categoryId]?.name}
                />
```

교체:

```tsx
                <ReactionBar
                  boothId={booth.id}
                  boothName={booth.name}
                  interestSlugs={boothValueSlugs(booth)}
                  categoryLabel={categoryById[booth.categoryId]?.name}
                  exhibitionSlug={slug}
                />
```

- [ ] **Step 4: 전시 홈이 `InterestFeed`에 `slug` 전달**

`src/app/(visitor)/exhibitions/[slug]/page.tsx`, 기존:

```tsx
          <InterestFeed
            items={feedItems}
            categoryById={categoryById}
            memoryLine={memoryLine}
          />
```

교체:

```tsx
          <InterestFeed
            items={feedItems}
            categoryById={categoryById}
            memoryLine={memoryLine}
            slug={slug}
          />
```

- [ ] **Step 5: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과

- [ ] **Step 6: 커밋**

```bash
git add src/components/feed/reaction-bar.tsx src/components/map/map-view.tsx src/components/feed/interest-feed.tsx "src/app/(visitor)/exhibitions/[slug]/page.tsx"
git commit -m "feat(companion): 비로그인 반응은 로컬만, 로미 즉답은 로그인 전용으로"
```

---

### Task 4: 전시 홈 — 비로그인 피드 자리에 로그인 CTA

**Files:**
- Modify: `src/lib/i18n/dictionaries.ts:199` (ko `feed` 네임스페이스)
- Modify: `src/lib/i18n/dictionaries.ts:686` (en `feed` 네임스페이스, 정확한 줄은 ko에
  추가한 줄 수만큼 밀림)
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx`

**Interfaces:**
- Consumes: `slug`(page.tsx가 라우트 파라미터로 이미 들고 있음, Task 3에서
  `<InterestFeed>`에 이미 전달 중)

- [ ] **Step 1: ko 카피 추가**

`src/lib/i18n/dictionaries.ts:199` 근처, 기존:

```ts
    searchPlaceholder: "부스 이름·작가로 검색",
```

교체(뒤에 2줄 추가):

```ts
    searchPlaceholder: "부스 이름·작가로 검색",
    loginCtaTitle: "로그인하면 로미가 이 전시에서 널 도와줄게",
    loginCtaBody:
      "지금은 그냥 둘러보는 거야. 로그인하면 반응한 것들을 기억해서 너한테 맞는 부스를 골라줄게.",
```

- [ ] **Step 2: en 카피 추가**

`src/lib/i18n/dictionaries.ts`의 en `feed` 네임스페이스, `searchPlaceholder: "Search
booths by name or artist",` 줄 바로 뒤에 2줄 추가:

```ts
    searchPlaceholder: "Search booths by name or artist",
    loginCtaTitle: "Log in and Romi will help you through this fair",
    loginCtaBody:
      "You're just browsing for now. Log in and I'll remember what you react to, and pick booths that fit you.",
```

- [ ] **Step 3: 전시 홈이 비로그인이면 CTA를, 로그인이면 기존 피드를 렌더**

`src/app/(visitor)/exhibitions/[slug]/page.tsx`, 기존(Task 3에서 이미 `slug={slug}`가
붙은 상태):

```tsx
          {/* 피드 상단 부스 검색 — 추천 몇 개 말고 전체 부스를 이름·작가로 찾기. */}
          {user && <BoothSearch slug={slug} categoryById={categoryById} />}
          <InterestFeed
            items={feedItems}
            categoryById={categoryById}
            memoryLine={memoryLine}
            slug={slug}
          />

          {feedItems.length > 0 && <FinishVisit slug={slug} />}
```

교체:

```tsx
          {/* 피드 상단 부스 검색 — 추천 몇 개 말고 전체 부스를 이름·작가로 찾기. */}
          {user && <BoothSearch slug={slug} categoryById={categoryById} />}
          {user ? (
            <InterestFeed
              items={feedItems}
              categoryById={categoryById}
              memoryLine={memoryLine}
              slug={slug}
            />
          ) : (
            // 비로그인 — 로미는 개인화 피드를 만들지 않는다(curateFeed 호출 자체를
            // 안 함, feedItems는 항상 빈 배열). 대신 로그인하면 뭐가 좋은지 안내.
            <Link
              href={`/login?next=${encodeURIComponent(`/exhibitions/${slug}`)}`}
              className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-primary">
                  {t("feed.loginCtaTitle")}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {t("feed.loginCtaBody")}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-primary" />
            </Link>
          )}

          {feedItems.length > 0 && <FinishVisit slug={slug} />}
```

(`Link`, `ChevronRight`는 이 파일에 이미 임포트돼 있다 — 새 임포트 불필요.)

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/i18n/dictionaries.ts "src/app/(visitor)/exhibitions/[slug]/page.tsx"
git commit -m "feat(feed): 비로그인 전시 홈의 피드 자리를 로그인 유도 CTA로"
```

---

### Task 5: 앱 온보딩 — 재노출 조건 이원화 + layout 레벨로 이동

**Files:**
- Modify: `src/lib/stores/companion.ts`
- Modify: `src/components/onboarding/app-onboarding.tsx`
- Modify: `src/app/(visitor)/layout.tsx`
- Modify: `src/app/(visitor)/page.tsx`

**Interfaces:**
- Consumes: `useAuthStore((s) => s.needsOnboarding)`,
  `useAuthStore((s) => s.setNeedsOnboarding)`(Task 2)
- Produces: `useCompanionStore((s) => s.appOnboardingJustCompleted): boolean`,
  `useCompanionStore((s) => s.signalAppOnboardingComplete): () => void`,
  `useCompanionStore((s) => s.clearAppOnboardingJustCompleted): () => void` — Task 6이 씀.

- [ ] **Step 1: 컴패니언 스토어에 "앱 온보딩 방금 끝냄" 신호 추가**

`src/lib/stores/companion.ts`의 `CompanionState` 인터페이스 끝(`setInterests`
다음)에 추가:

```ts
  /**
   * 앱 온보딩(층 전체 공통)을 방금 완료했다는 1회성 신호 — 지금 보고 있는 전시의
   * ValueOnboarding이 이걸 보고 자동으로 이어서 열린다(AppOnboardingGate가 layout
   * 레벨이라 어느 전시인지 몰라, "방금 끝났다"는 사실만 넘기고 소비 쪽이 판단한다).
   * flash/clearFlash와 같은 펄스 패턴 — 건너뛰기(skip)는 이 신호를 안 보낸다(사용자가
   * 안 하겠다고 한 걸 곧바로 또 물으면 안 됨).
   */
  appOnboardingJustCompleted: boolean;
  signalAppOnboardingComplete: () => void;
  clearAppOnboardingJustCompleted: () => void;
```

같은 파일의 `create<CompanionState>((set) => ({ ... }))` 안, `setInterests: (interests)
=> set({ interests }),` 다음 줄에 추가:

```ts
  appOnboardingJustCompleted: false,
  signalAppOnboardingComplete: () => set({ appOnboardingJustCompleted: true }),
  clearAppOnboardingJustCompleted: () => set({ appOnboardingJustCompleted: false }),
```

- [ ] **Step 2: `AppOnboardingGate` — 이원화된 재노출 조건**

`src/components/onboarding/app-onboarding.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { RoamMotion, THINKING_POOL } from "@/components/companion/roam-motion";
import { Conversation } from "@/components/onboarding/conversation";
import { useAuthStore, PENDING_VALUES_KEY } from "@/lib/stores/auth";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";
import {
  APP_QUESTIONS,
  topValues,
  type Tally,
} from "@/lib/onboarding/questions";
import { Button } from "@/components/ui/button";

const FLAG = "roam-app-onboarded";
type Phase = "intro" | "quiz" | "saving";

/**
 * 앱 최초진입 온보딩 — Romi 중앙 대화형(ingan.ai 스타일). 짧은 인사 → 적응형 시나리오 Q&A
 * (진행바 없음, 충분히 파악될 때까지) → 답변을 관람 가치로 집계해 브레인에 시드.
 *
 * 재노출 조건이 계정 유무로 갈린다:
 * - 비로그인: localStorage 플래그(이 브라우저에서 이미 봤음) — 계정이 없어 서버에
 *   물을 게 없다. 완료·건너뛰기 둘 다 이 플래그로 기억한다.
 * - 로그인: 서버 신호(brain.interests가 비었는지, useAuthStore.needsOnboarding) —
 *   계정에 묶이므로 로그인 후엔 정확하고 재노출도 안 된다. 이게 "로그인할 때마다
 *   온보딩이 다시 뜬다"는 문제를 해소하는 지점이다(비로그인 때 답한 것도 로그인 시
 *   소급 반영되어 이 신호가 이미 false로 들어온다, auth.ts 참고).
 */
export function AppOnboardingGate() {
  const router = useRouter();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const needsOnboarding = useAuthStore((s) => s.needsOnboarding);
  const setNeedsOnboarding = useAuthStore((s) => s.setNeedsOnboarding);
  const signalAppOnboardingComplete = useCompanionStore(
    (s) => s.signalAppOnboardingComplete,
  );
  const [anonDismissed, setAnonDismissed] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem(FLAG),
  );
  const [phase, setPhase] = useState<Phase>("intro");

  const onboarded = user ? !needsOnboarding : anonDismissed;
  if (onboarded || !ready) return null;

  async function complete(tally: Tally) {
    setPhase("saving");
    const values = topValues(tally, 3);
    try {
      if (user) {
        await api.post("/api/me/values", { values });
      } else if (typeof window !== "undefined") {
        // 미로그인: 취향을 로컬에 담아두고, 로그인 시 브레인에 동기화(auth store).
        localStorage.setItem(PENDING_VALUES_KEY, JSON.stringify(values));
      }
    } catch {
      // 실패해도 진행.
    }
    if (user) {
      setNeedsOnboarding(false);
    } else if (typeof window !== "undefined") {
      localStorage.setItem(FLAG, "1");
      setAnonDismissed(true);
    }
    // 지금 전시 페이지에 있으면 그 전시의 관람 가치 온보딩으로 자동으로 이어준다
    // (ValueOnboarding이 구독). 건너뛰기(skip)는 이 신호를 안 보낸다.
    signalAppOnboardingComplete();
    router.refresh();
  }

  // 강제하지 않는다 — 먼저 둘러보고 싶으면 넘어갈 수 있게(플래그만 세팅해 다시 안 뜨게).
  // 취향은 관람하며 반응으로 쌓인다(빈 브레인=인기순 폴백).
  function skip() {
    if (user) {
      setNeedsOnboarding(false);
    } else if (typeof window !== "undefined") {
      localStorage.setItem(FLAG, "1");
      setAnonDismissed(true);
    }
  }

  return (
    // aria-modal: 온보딩 활성 동안 뒤 홈 콘텐츠를 보조기술 트리에서 비활성으로 —
    // 스크린리더가 질문과 배경 카드를 동시에 읽지 않도록. 시각적으론 불투명 bg가 덮음.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("onboardingQ.introTitle")}
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      {phase === "intro" && (
        <div className="flex flex-1 flex-col px-6 pb-8 pt-safe">
          {/* 로미 + 카피 — 상단 2/3 중앙 (ingan.ai 톤) */}
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <span className="flex size-32 items-center justify-center overflow-hidden rounded-[2.5rem]">
              <RoamMotion src="/walk_think.webm" />
            </span>
            <h1 className="text-2xl font-extrabold leading-snug">
              {t("onboardingQ.introTitle")}
            </h1>
            <p className="max-w-[20rem] text-[15px] leading-relaxed text-muted-foreground">
              {t("onboardingQ.introSub")}
            </p>
          </div>
          {/* 하단 고정 CTA + 스킵(강제 아님) */}
          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setPhase("quiz")}
            >
              {t("onboardingQ.introCta")}
            </Button>
            <button
              type="button"
              onClick={skip}
              className="w-full py-2 text-sm font-medium text-muted-foreground active:opacity-70"
            >
              {t("onboardingQ.introSkip")}
            </button>
          </div>
        </div>
      )}

      {phase === "quiz" && (
        <Conversation
          mode="adaptive"
          questions={APP_QUESTIONS}
          subtitleKey="onboardingQ.learningApp"
          onComplete={complete}
        />
      )}

      {phase === "saving" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex size-24 items-center justify-center overflow-hidden rounded-[2rem]">
            <RoamMotion pool={THINKING_POOL} />
          </span>
          <p className="text-[15px] font-medium text-muted-foreground">
            {t("onboardingQ.analyzing")}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `AppOnboardingGate`를 layout 레벨로 이동**

`src/app/(visitor)/layout.tsx` 전체를 아래로 교체:

```tsx
import { CompanionBar } from "@/components/companion/companion-bar";
import { AppOnboardingGate } from "@/components/onboarding/app-onboarding";

export default function VisitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background"
    >
      {children}
      <CompanionBar />
      {/* 홈뿐 아니라 전시·지도·부스 상세 등 모든 방문객 화면 공통 — 공유 링크로
          전시에 바로 들어와도(홈을 안 거쳐도) 필요하면 뜬다. */}
      <AppOnboardingGate />
    </div>
  );
}
```

`src/app/(visitor)/page.tsx`에서 기존 `<AppOnboardingGate />` 렌더 줄과
`import { AppOnboardingGate } from "@/components/onboarding/app-onboarding";` 임포트
줄을 제거한다(layout이 대신 렌더하므로 중복 방지).

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stores/companion.ts src/components/onboarding/app-onboarding.tsx "src/app/(visitor)/layout.tsx" "src/app/(visitor)/page.tsx"
git commit -m "feat(onboarding): 앱 온보딩 재노출을 계정 상태 기준으로, layout 레벨로 이동"
```

---

### Task 6: 전시별 온보딩 자동 이어붙이기

**Files:**
- Modify: `src/components/onboarding/value-onboarding.tsx`

**Interfaces:**
- Consumes: `useCompanionStore((s) => s.appOnboardingJustCompleted)`,
  `useCompanionStore((s) => s.clearAppOnboardingJustCompleted)`(Task 5)

- [ ] **Step 1: 앱 온보딩 완료 신호를 구독해 자동으로 시트 연다**

`src/components/onboarding/value-onboarding.tsx` 상단 import에 추가:

```tsx
import { useEffect, useState } from "react";
import { useCompanionStore } from "@/lib/stores/companion";
```

(기존 `import { useState } from "react";` 줄을 위 `useEffect, useState` 임포트로
교체.)

같은 파일, `const [rhythm, setRhythm] = useState<Rhythm>(DEFAULT_RHYTHM);` 다음 줄에
추가:

```tsx

  // 앱 온보딩을 방금 끝냈고(건너뛰기 아님) 이 전시가 아직 확신 가치가 없으면
  // 자동으로 이어서 연다 — 사용자가 카드를 따로 탭할 필요 없이 "온보딩 하나로
  // 느껴지게" 한다.
  const appOnboardingJustCompleted = useCompanionStore(
    (s) => s.appOnboardingJustCompleted,
  );
  const clearAppOnboardingJustCompleted = useCompanionStore(
    (s) => s.clearAppOnboardingJustCompleted,
  );
  useEffect(() => {
    if (appOnboardingJustCompleted && !hasChosenValues) {
      start();
      clearAppOnboardingJustCompleted();
    }
    // start는 리렌더마다 새로 만들어지는 함수라 deps에 넣지 않는다(무한 루프 방지) —
    // appOnboardingJustCompleted가 true → false로 바뀌는 그 순간에만 반응하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appOnboardingJustCompleted, hasChosenValues, clearAppOnboardingJustCompleted]);
```

- [ ] **Step 2: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과

- [ ] **Step 3: 커밋**

```bash
git add src/components/onboarding/value-onboarding.tsx
git commit -m "feat(onboarding): 앱 온보딩 완료 시 전시별 온보딩으로 자동 이어붙이기"
```

---

## 최종 검증 (전체 태스크 완료 후)

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/proxy.ts src/lib/stores/auth.ts src/lib/stores/companion.ts src/components/feed/reaction-bar.tsx src/components/feed/interest-feed.tsx src/components/map/map-view.tsx src/components/onboarding/app-onboarding.tsx src/components/onboarding/value-onboarding.tsx "src/app/(visitor)/layout.tsx" "src/app/(visitor)/page.tsx" "src/app/(visitor)/exhibitions/[slug]/page.tsx" src/app/api/auth/me/route.ts src/app/api/auth/login/route.ts src/lib/i18n/dictionaries.ts
```

수동 확인(로컬 mock 서버, 눈으로):
- 비로그인 상태로 전시 상세·지도·부스 상세에 직접 들어가지는지(리다이렉트 없이).
- 비로그인으로 지도에서 반응 버튼을 누르면 버튼은 토글되지만 로미 토스트가 안 뜨고,
  전시당 첫 반응에서만 "로그인해야 기억해" 안내가 뜨는지.
- 전시 홈이 비로그인이면 피드 자리에 로그인 CTA가 뜨는지.
- 비로그인으로 앱 온보딩 + 전시 온보딩을 이어서 할 수 있는지(자동 이어붙임).
- 그 상태로 로그인하면: 온보딩 재노출 없이, "아까 둘러본 것도 다 반영했어" 토스트가
  뜨고, 아까 눌렀던 반응이 지도/피드에 실제로 반영돼 있는지.
- 메모장(`/exhibitions/[slug]/notes`)·커뮤니티는 비로그인으로 여전히 `/login`
  리다이렉트되는지.
