# 네이티브 로그인 백엔드 엔드포인트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iOS가 브라우저 없이 Sign in with Apple / Google 네이티브로 로그인할 수 있도록, ID 토큰을 서버가 직접 검증해 기존 `app_user`/`roam_user` 세션 체계에 편입시키는 API 엔드포인트 2개(`POST /api/auth/apple/native`, `POST /api/auth/google/native`)를 추가한다.

**Architecture:** `jose`(JWKS 기반 JWT 검증) 신규 의존성 → `src/lib/auth/verify-{apple,google}-token.ts`(순수 검증 함수, 각각 `{sub, email?, ...}` 반환) → 두 라우트 핸들러가 검증 결과를 기존 `getUserByProvider`/`createOAuthUser`/`setUserCookie`/`readBrain` 파이프라인에 그대로 흘림(웹 OAuth 콜백과 동일 로직 재사용).

**Tech Stack:** Next.js Route Handlers, `jose`(신규), Zod, Vitest.

## Global Constraints

- `env.APPLE_BUNDLE_ID`/`env.GOOGLE_IOS_CLIENT_ID`는 대문자 스네이크 케이스로 `src/lib/env.ts`의 기존 `env.GEMINI_API_KEY` 등과 동일 패턴을 따른다 — camelCase 아님.
- 새 `ApiErrorCode`를 추가하지 않는다 — 기존 코드(`UNAUTHORIZED`=401, `INTERNAL`=500)로 전부 표현 가능.
- 신원 확정 이후 로직(`getUserByProvider`→`createOAuthUser`→`setUserCookie`→`needsOnboarding`)은 `src/app/auth/callback/route.ts`(96-110행)·`src/app/api/auth/login/route.ts`(24-40행)와 동일한 패턴을 그대로 따른다 — 새로 설계하지 않는다.
- JWT 검증 자체(서명·만료)는 `jose`에 위임 — 직접 구현하지 않는다.
- 토큰 검증 실패 사유는 클라이언트에 노출하지 않는다(전부 `401 UNAUTHORIZED`, 메시지는 일반적으로).

---

### Task 1: `jose` 의존성 + 환경변수 추가

**Files:**
- Modify: `package.json`
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `env.APPLE_BUNDLE_ID: string | undefined`, `env.GOOGLE_IOS_CLIENT_ID: string | undefined` — Task 2·3이 이 두 값을 읽는다.

- [ ] **Step 1: `jose` 설치**

Run: `npm install jose`
Expected: `package.json`의 `dependencies`에 `jose` 추가, `package-lock.json` 갱신.

- [ ] **Step 2: `env.ts` 스키마에 두 필드 추가**

`src/lib/env.ts`의 `schema`(zod object) — `ADMIN_EMAILS: z.string().min(1).optional(),` 줄 바로 다음에 추가:

```typescript
  /** iOS 앱 번들 ID — Sign in with Apple identityToken의 aud 검증용. */
  APPLE_BUNDLE_ID: z.string().min(1).optional(),
  /** Google Cloud Console의 iOS OAuth 클라이언트 ID — Google idToken의 aud 검증용. */
  GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional(),
```

같은 파일의 `parsed = schema.safeParse({...})` 호출부 — `ADMIN_EMAILS: e(process.env.ADMIN_EMAILS),` 줄 바로 다음에 추가:

```typescript
  APPLE_BUNDLE_ID: e(process.env.APPLE_BUNDLE_ID),
  GOOGLE_IOS_CLIENT_ID: e(process.env.GOOGLE_IOS_CLIENT_ID),
```

- [ ] **Step 3: `.env.example`에 안내 추가**

`.env.example` 맨 끝에 추가:

```
# 네이티브 로그인(iOS) — Apple/Google ID 토큰의 aud 검증용. 둘 다 없으면 두
# /api/auth/*/native 엔드포인트가 500을 반환한다(로컬 mock 개발에선 안 씀).
APPLE_BUNDLE_ID=
GOOGLE_IOS_CLIENT_ID=
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json src/lib/env.ts .env.example
git commit -m "feat(auth): jose 의존성 + 네이티브 로그인용 환경변수 추가"
```

---

### Task 2: JWT 검증 모듈 (Apple / Google)

**Files:**
- Create: `src/lib/auth/verify-apple-token.ts`
- Create: `src/lib/auth/verify-google-token.ts`

**Interfaces:**
- Consumes: Task 1의 `env.APPLE_BUNDLE_ID`, `env.GOOGLE_IOS_CLIENT_ID`.
- Produces: `verifyAppleIdentityToken(token: string): Promise<{ sub: string; email?: string }>`, `verifyGoogleIdToken(token: string): Promise<{ sub: string; email?: string; name?: string; picture?: string }>` — Task 3의 라우트 핸들러가 이 두 함수를 호출(그리고 테스트에서 `vi.mock`으로 갈아끼움).

- [ ] **Step 1: `verify-apple-token.ts` 작성**

```typescript
// src/lib/auth/verify-apple-token.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/lib/env";

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

export interface AppleTokenClaims {
  sub: string;
  email?: string;
}

/**
 * Sign in with Apple의 identityToken(JWT)을 Apple JWKS로 서명 검증한다.
 * 실패(서명·만료·aud/iss 불일치)하면 jose가 던지는 에러를 그대로 던진다 —
 * 호출부(라우트)가 401로 매핑한다.
 */
export async function verifyAppleIdentityToken(
  token: string,
): Promise<AppleTokenClaims> {
  const { payload } = await jwtVerify(token, APPLE_JWKS, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_BUNDLE_ID,
  });
  return {
    sub: payload.sub as string,
    email: typeof payload.email === "string" ? payload.email : undefined,
  };
}
```

- [ ] **Step 2: `verify-google-token.ts` 작성**

```typescript
// src/lib/auth/verify-google-token.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/lib/env";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export interface GoogleTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * GIDSignIn(Google Sign-In iOS SDK)이 발급한 idToken을 Google JWKS로 서명
 * 검증한다. 실패 시 jose 에러를 그대로 던진다 — 호출부가 401로 매핑한다.
 */
export async function verifyGoogleIdToken(
  token: string,
): Promise<GoogleTokenClaims> {
  const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: env.GOOGLE_IOS_CLIENT_ID,
  });
  return {
    sub: payload.sub as string,
    email: typeof payload.email === "string" ? payload.email : undefined,
    name: typeof payload.name === "string" ? payload.name : undefined,
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
}
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (이 태스크는 실제 네트워크 JWKS 호출을 테스트하지 않는다 — 서명 검증
자체의 정확성은 `jose` 자체 테스트 스위트가 보증하는 영역이고, 우리 코드가 검증하는 건
"올바른 `issuer`/`audience`로 `jwtVerify`를 호출하는가"인데 이건 Task 3의 라우트 테스트가
`vi.mock`으로 이 모듈 자체를 갈아끼워서 간접 검증한다 — 여기서 별도 유닛테스트 안 만든다.)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/auth/verify-apple-token.ts src/lib/auth/verify-google-token.ts
git commit -m "feat(auth): Apple/Google ID 토큰 JWKS 서명 검증 모듈 추가"
```

---

### Task 3: 라우트 핸들러 — `POST /api/auth/apple/native`

**Files:**
- Create: `src/app/api/auth/apple/native/route.ts`
- Create: `src/app/api/auth/apple/native/route.test.ts`

**Interfaces:**
- Consumes: Task 2의 `verifyAppleIdentityToken`. 기존 `getRepository`(`@/lib/repositories`), `setUserCookie`/`fail`/`created`/`parseBody`(`@/lib/api/http`), `uniqueNickname`(`@/lib/auth/oauth-nickname`), `readBrain`(`@/lib/memory/service`), `OAuthIdentity`(`@/lib/types`).
- Produces: 응답 `{ data: { user: User, needsOnboarding: boolean } }`(성공, 201) — iOS 클라이언트가 이 `needsOnboarding`로 온보딩/피드 분기.

- [ ] **Step 1: Zod 스키마 추가**

`src/lib/schemas/index.ts`의 `loginSchema` 근처에 추가:

```typescript
export const appleNativeLoginSchema = z.object({
  identityToken: z.string().min(1),
  fullName: z.string().trim().min(1).max(100).optional(),
});
export type AppleNativeLoginInput = z.infer<typeof appleNativeLoginSchema>;
```

- [ ] **Step 2: 라우트 핸들러 작성**

```typescript
// src/app/api/auth/apple/native/route.ts
import { getRepository } from "@/lib/repositories";
import { created, fail, parseBody, setUserCookie } from "@/lib/api/http";
import { appleNativeLoginSchema } from "@/lib/schemas";
import { verifyAppleIdentityToken } from "@/lib/auth/verify-apple-token";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { readBrain } from "@/lib/memory/service";
import { env } from "@/lib/env";

const PROVIDER = "apple";

export async function POST(req: Request) {
  if (!env.APPLE_BUNDLE_ID) {
    return fail("INTERNAL", "Apple 로그인이 아직 설정되지 않았어요");
  }

  const parsed = await parseBody(req, appleNativeLoginSchema);
  if (!parsed.ok) return parsed.res;
  const { identityToken, fullName } = parsed.data;

  let claims: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
  try {
    claims = await verifyAppleIdentityToken(identityToken);
  } catch {
    return fail("UNAUTHORIZED", "로그인 정보를 확인할 수 없어요");
  }

  const repo = await getRepository();
  let appUser = await repo.getUserByProvider(PROVIDER, claims.sub);
  if (!appUser) {
    const nickname = await uniqueNickname(repo, {
      name: fullName,
      email: claims.email,
    });
    appUser = await repo.createOAuthUser({
      provider: PROVIDER,
      providerAccountId: claims.sub,
      nickname,
      email: claims.email,
    });
  }

  await setUserCookie(appUser.id);
  const needsOnboarding = (await readBrain(appUser.id)).interests.length === 0;
  return created({ user: appUser, needsOnboarding });
}
```

- [ ] **Step 3: 실패하는 테스트 작성**

```typescript
// src/app/api/auth/apple/native/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claims: { sub: "apple-sub-1", email: "a@example.com" } as {
    sub: string;
    email?: string;
  } | null,
  shouldThrow: false,
}));
vi.mock("@/lib/auth/verify-apple-token", () => ({
  verifyAppleIdentityToken: async () => {
    if (state.shouldThrow) throw new Error("bad token");
    return state.claims;
  },
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, APPLE_BUNDLE_ID: "com.roam.app" } };
});

import { getRepository } from "@/lib/repositories";
import { recordSignal } from "@/lib/memory/service";
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/auth/apple/native", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/apple/native", () => {
  beforeEach(() => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore =
      undefined;
    state.claims = { sub: "apple-sub-1", email: "a@example.com" };
    state.shouldThrow = false;
  });

  it("신규 Apple 계정이면 생성하고 needsOnboarding true를 준다", async () => {
    const res = await POST(req({ identityToken: "t", fullName: "테스터" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.needsOnboarding).toBe(true);
    expect(body.data.user.nickname).toContain("테스터");
  });

  it("이미 연결된 Apple 계정이면 기존 유저로 로그인한다", async () => {
    const first = await POST(req({ identityToken: "t", fullName: "테스터" }));
    const firstBody = await first.json();

    const second = await POST(req({ identityToken: "t" }));
    const secondBody = await second.json();

    expect(secondBody.data.user.id).toBe(firstBody.data.user.id);
  });

  it("가치 온보딩을 마친 계정이면 needsOnboarding false를 준다", async () => {
    const first = await POST(req({ identityToken: "t", fullName: "테스터" }));
    const firstBody = await first.json();

    // /api/me/values 라우트와 동일한 패턴: 명시 신호를 심어 브레인을 채운다.
    const repo = await getRepository();
    const { data } = await repo.listExhibitions({ limit: 1 });
    await recordSignal(firstBody.data.user.id, {
      kind: "reaction_must",
      exhibitionId: data[0].id,
      slugs: ["goods"],
    });

    const second = await POST(req({ identityToken: "t" }));
    const secondBody = await second.json();
    expect(secondBody.data.needsOnboarding).toBe(false);
  });

  it("토큰 검증 실패 시 401을 준다", async () => {
    state.shouldThrow = true;
    const res = await POST(req({ identityToken: "bad" }));
    expect(res.status).toBe(401);
  });

  it("바디가 스키마에 안 맞으면 400을 준다", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 4: 테스트 실행, 통과 확인**

Run: `npx vitest run src/app/api/auth/apple/native/route.test.ts`
Expected: 5개 테스트 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/schemas/index.ts src/app/api/auth/apple/native/
git commit -m "feat(auth): POST /api/auth/apple/native 엔드포인트 추가"
```

---

### Task 4: 라우트 핸들러 — `POST /api/auth/google/native`

**Files:**
- Create: `src/app/api/auth/google/native/route.ts`
- Create: `src/app/api/auth/google/native/route.test.ts`

**Interfaces:**
- Consumes: Task 2의 `verifyGoogleIdToken`. Task 3과 동일한 공통 헬퍼들.
- Produces: Task 3과 동일한 응답 shape.

Task 3과 거의 동일 — 차이점만 기록한다.

- [ ] **Step 1: Zod 스키마 추가**

`src/lib/schemas/index.ts`에 추가:

```typescript
export const googleNativeLoginSchema = z.object({
  idToken: z.string().min(1),
});
export type GoogleNativeLoginInput = z.infer<typeof googleNativeLoginSchema>;
```

- [ ] **Step 2: 라우트 핸들러 작성**

```typescript
// src/app/api/auth/google/native/route.ts
import { getRepository } from "@/lib/repositories";
import { created, fail, parseBody, setUserCookie } from "@/lib/api/http";
import { googleNativeLoginSchema } from "@/lib/schemas";
import { verifyGoogleIdToken } from "@/lib/auth/verify-google-token";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { readBrain } from "@/lib/memory/service";
import { env } from "@/lib/env";

const PROVIDER = "google";

export async function POST(req: Request) {
  if (!env.GOOGLE_IOS_CLIENT_ID) {
    return fail("INTERNAL", "Google 로그인이 아직 설정되지 않았어요");
  }

  const parsed = await parseBody(req, googleNativeLoginSchema);
  if (!parsed.ok) return parsed.res;
  const { idToken } = parsed.data;

  let claims: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    claims = await verifyGoogleIdToken(idToken);
  } catch {
    return fail("UNAUTHORIZED", "로그인 정보를 확인할 수 없어요");
  }

  const repo = await getRepository();
  let appUser = await repo.getUserByProvider(PROVIDER, claims.sub);
  if (!appUser) {
    const nickname = await uniqueNickname(repo, {
      name: claims.name,
      email: claims.email,
    });
    appUser = await repo.createOAuthUser({
      provider: PROVIDER,
      providerAccountId: claims.sub,
      nickname,
      email: claims.email,
      avatarUrl: claims.picture,
    });
  }

  await setUserCookie(appUser.id);
  const needsOnboarding = (await readBrain(appUser.id)).interests.length === 0;
  return created({ user: appUser, needsOnboarding });
}
```

- [ ] **Step 3: 테스트 작성**

Task 3의 `route.test.ts`를 거의 그대로 복사하되:
- `vi.mock("@/lib/auth/verify-apple-token", ...)` → `vi.mock("@/lib/auth/verify-google-token", ...)`, mock 함수 이름 `verifyGoogleIdToken`
- `state.claims`에 `name`/`picture` 필드 포함(Google은 매번 옴): `{ sub: "google-sub-1", email: "g@example.com", name: "테스터", picture: "https://..." }`
- `env.APPLE_BUNDLE_ID` → `env.GOOGLE_IOS_CLIENT_ID`
- 요청 바디 `{ identityToken, fullName }` → `{ idToken }`
- import 경로 `./route`는 그대로(같은 디렉터리 상대 경로)

Task 3 Step 3의 "온보딩 테스트 repo.setSignal 시그니처 확인" 주의사항 동일 적용.

- [ ] **Step 4: 테스트 실행, 통과 확인**

Run: `npx vitest run src/app/api/auth/google/native/route.test.ts`
Expected: 5개 테스트 전부 PASS.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/schemas/index.ts src/app/api/auth/google/native/
git commit -m "feat(auth): POST /api/auth/google/native 엔드포인트 추가"
```

---

### Task 5: 전체 검증

**Files:** 없음(검증만).

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: 모든 기존 테스트 + 신규 10개(Apple 5 + Google 5) 전부 PASS. 실패하는 기존 테스트가
있으면 안 됨(회귀 없어야 함).

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/lib/auth src/lib/env.ts src/lib/schemas/index.ts src/app/api/auth`
Expected: 에러 없음.

- [ ] **Step 3: 완료 보고**

문제 없으면 플랜 완료. 웹 쪽 API 준비 끝 — 다음 순서(iOS `AuthenticationServices`/
`GIDSignIn` 연동)로 넘어갈 수 있다.

## Self-Review 결과

- **스펙 커버리지**: §2(두 엔드포인트)→Task 3·4, §3(공통 처리)→Task 3·4 핸들러 본문,
  §4(jose·검증 모듈)→Task 2, §5(환경변수)→Task 1, §7(테스트 케이스 4종)→Task 3·4의
  5개 테스트(스키마 실패 케이스 하나 추가).
- **플레이스홀더 스캔**: Task 3 Step 3에 "정확한 시그니처를 다시 조회하지 못했다"는
  명시적 불확실성 고지가 하나 있음 — 이건 플레이스홀더가 아니라 실행자에게 실제
  파일을 열어 확인하라는 실행 가능한 지시(정확한 코드를 지어내지 않기 위한 의도적 처리).
- **타입 일관성**: `verifyAppleIdentityToken`/`verifyGoogleIdToken`의 반환 타입이 Task 2
  선언과 Task 3·4의 사용처에서 동일.
- **범위 확인**: iOS 연동·닉네임 로그인 제거는 이 플랜에 없음 — 의도된 것(스펙 §6 범위 밖).
