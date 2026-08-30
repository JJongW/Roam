# 네이티브 로그인 백엔드 엔드포인트 설계 (Sign in with Apple / Google 네이티브)

**날짜**: 2026-08-29
**범위**: iOS 네이티브 앱(`Roam-ios`)이 브라우저 리다이렉트 없이 로그인할 수 있도록,
Apple/Google이 발급한 ID 토큰을 서버가 직접 검증해 기존 `app_user`/`roam_user` 세션
체계에 편입시키는 API 엔드포인트 2개를 추가한다.
**전제**: `docs/superpowers/specs/2026-08-27-roam-ios-split-design.md` §6에서 이미 확정된
인증 아키텍처(닉네임 로그인 없음, Sign in with Apple + Google 네이티브, 진입 시점은
온보딩/피드 접근 시점)를 그대로 구현한다 — 이 스펙은 그 §6.2가 남겨둔 "신규 엔드포인트
2개"의 상세 설계다.

## 1. 배경

웹의 기존 OAuth(`/auth/callback`)는 브라우저 리다이렉트(`code` 쿼리 파라미터 교환)를
전제로 한다. iOS는 `AuthenticationServices`(Sign in with Apple)와 `GIDSignIn`(Google
Sign-In SDK)로 각각 완전 네이티브 인증을 마치고 **ID 토큰(JWT)**을 손에 쥔 상태로
서버에 도착한다 — 리다이렉트가 아니라 토큰을 담은 POST 요청. 서버는 이 토큰이 진짜
Apple/Google이 서명한 게 맞는지 검증하고, 검증된 신원(`sub`)을 기존 `getUserByProvider`/
`createOAuthUser`(둘 다 이미 provider 문자열에 구애받지 않게 제네릭하게 설계돼 있음,
`src/lib/repositories/types.ts:210-215`)에 그대로 흘려보낸다.

## 2. 엔드포인트

### `POST /api/auth/apple/native`

**요청 바디**:
```ts
{
  identityToken: string;      // AuthenticationServices가 발급한 JWT
  fullName?: string;          // Apple은 최초 인가 시에만 이름을 별도 필드로 준다(JWT엔 없음)
}
```

**처리**:
1. `identityToken`을 Apple의 JWKS(`https://appleid.apple.com/auth/keys`)로 서명 검증.
   `iss` = `https://appleid.apple.com`, `aud` = 앱 번들 ID(`env.APPLE_BUNDLE_ID`, 신규 환경변수).
2. 검증 실패(서명·만료·aud 불일치) → `401 UNAUTHORIZED`.
3. `payload.sub`를 `providerAccountId`로, `payload.email`(있으면)을 이메일로 사용.
4. 이하 §3(공통 처리)로.

### `POST /api/auth/google/native`

**요청 바디**:
```ts
{ idToken: string; }  // GIDSignIn이 발급한 ID 토큰
```

**처리**:
1. `idToken`을 Google JWKS(`https://www.googleapis.com/oauth2/v3/certs`)로 서명 검증.
   `iss` ∈ `["https://accounts.google.com", "accounts.google.com"]`, `aud` = iOS OAuth
   클라이언트 ID(`env.GOOGLE_IOS_CLIENT_ID`, 신규 환경변수).
2. 검증 실패 → `401 UNAUTHORIZED`.
3. `payload.sub`를 `providerAccountId`로, `payload.email`/`payload.name`/`payload.picture`
   그대로 사용(Google idToken엔 매번 다 들어있음 — Apple과 다름).
4. 이하 §3(공통 처리)로.

## 3. 공통 처리 (두 엔드포인트 동일)

`/auth/callback`(웹)의 신원 확정 이후 로직을 그대로 재사용한다:

```ts
const repo = await getRepository();
let appUser = await repo.getUserByProvider(provider, sub);
if (!appUser) {
  const nickname = await uniqueNickname(repo, { name, email });
  appUser = await repo.createOAuthUser({ provider, providerAccountId: sub, nickname, email, avatarUrl });
}
await setUserCookie(appUser.id);
const needsOnboarding = (await readBrain(appUser.id)).interests.length === 0;
return created({ user: appUser, needsOnboarding });
```

`needsOnboarding` 응답 필드는 `POST /api/auth/login`(닉네임 로그인) 응답과 동일 형태 —
iOS가 로그인 직후 온보딩으로 갈지 피드로 바로 갈지 이 필드 하나로 분기한다.

## 4. JWT 검증 — 라이브러리·구조

`jose`(Edge 런타임 호환, 능동 유지보수)를 신규 의존성으로 추가한다. **근거**: 프로젝트에
아직 JWT 검증 라이브러리가 전혀 없고(확인함, `package.json`에 `jose`/`jsonwebtoken` 없음),
Apple·Google 둘 다 JWKS 기반 RS256 서명 검증이 필요해 직접 구현하면 서명 검증 자체를
재발명하는 꼴 — 이건 "우리가 못 풀 문제가 아니라 안 풀어도 되는 문제".

검증 로직은 라우트 핸들러에서 분리해 **별도 모듈**로 뺀다 — 라우트 테스트가 실제 네트워크로
Apple/Google JWKS를 안 때리고 이 모듈만 mock하도록.

```
src/lib/auth/
  verify-apple-token.ts   verifyAppleIdentityToken(token) -> { sub, email? }
  verify-google-token.ts  verifyGoogleIdToken(token) -> { sub, email?, name?, picture? }
```

```ts
// src/lib/auth/verify-apple-token.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/lib/env";

const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export interface AppleTokenClaims {
  sub: string;
  email?: string;
}

export async function verifyAppleIdentityToken(token: string): Promise<AppleTokenClaims> {
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

```ts
// src/lib/auth/verify-google-token.ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "@/lib/env";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export interface GoogleTokenClaims {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
}

export async function verifyGoogleIdToken(token: string): Promise<GoogleTokenClaims> {
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

`jwtVerify`가 던지는 에러(서명 불일치·만료·`aud`/`iss` 불일치 전부 `JWTVerificationFailed`
계열)는 라우트에서 캐치해 `401`로 매핑한다 — 실패 사유를 클라이언트에 노출하지 않는다
(왜 실패했는지 알려주는 건 토큰 위조 시도에 힌트를 주는 꼴).

## 5. 신규 환경변수

`src/lib/env.ts`의 `schema`(zod object)에 두 필드 추가, `parsed = schema.safeParse({...})`
호출부에도 `e(process.env.X)`로 각각 추가(기존 패턴과 동일 — 빈 문자열은 미설정 취급):
- `APPLE_BUNDLE_ID: z.string().min(1).optional()` — iOS 앱 번들 ID(Apple identityToken의
  `aud` 검증용).
- `GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional()` — Google Cloud Console의 iOS OAuth
  클라이언트 ID.

참조는 `env.APPLE_BUNDLE_ID`/`env.GOOGLE_IOS_CLIENT_ID`(대문자 스네이크 — `env.ts`의 기존
`env.GEMINI_API_KEY`/`env.ORGANIZER_CODE`와 동일 컨벤션, camelCase 아님).

둘 다 없으면(로컬 mock 개발 환경) 두 엔드포인트는 `fail("INTERNAL", "...")`(500)을
반환한다 — `ApiErrorCode`(`src/lib/types`)에 이미 있는 코드로 충분해서 새 코드를
추가하지 않는다(새 코드 하나 추가하는 게 이 프로젝트 전역 타입에 영향 주는 것치곤
얻는 게 없음). 값이 없는데 검증을 시도하면 `undefined` audience로 모든 토큰이 막히거나
반대로 검증이 무의미해지는 상태가 조용히 생긴다 — 그래서 사전 가드가 필요하다는 게 요지.

## 6. 범위 밖

- iOS 쪽 `AuthenticationServices`/`GIDSignIn` 연동 — 별도 스펙(다음 순서).
- 웹의 닉네임 로그인 제거 — 이미 별도 후속 항목으로 스펙 §2에 파킹됨, 안 건드림.
- admin 로그인 경로 — `/auth/callback`의 admin 분기는 그대로 두고 이 스펙은 방문객
  로그인만 다룬다.

## 7. 검증

- `npx vitest run` — 신규 라우트 테스트: `verifyAppleIdentityToken`/`verifyGoogleIdToken`을
  mock해서 (a) 기존 provider 계정 로그인 (b) 신규 계정 생성 + `needsOnboarding: true`
  (c) 토큰 검증 실패 시 401 (d) 환경변수 없을 때 500(`INTERNAL`) 네 가지 케이스.
- `npx tsc --noEmit`, `npx eslint <변경 경로>`.

## 8. 후속 — provider 문자열과 identity 공간 분리 (병합 리뷰에서 발견)

§3의 `provider` 값을 초안 그대로 `"google"`/`"apple"`로 쓰면 웹의 기존 OAuth 콜백
(`/auth/callback`)과 provider 문자열이 겹친다. 그런데 `providerAccountId`로 넣는 값의
정체가 서로 다르다 — 웹 콜백(`src/app/auth/callback/route.ts:100`)은 `authUser.id`,
즉 Supabase GoTrue가 발급한 UUID를 쓰고, 이 스펙의 네이티브 라우트는 §2에서 그대로
서술한 대로 `payload.sub`, 즉 Google/Apple이 발급한 진짜 sub(숫자 문자열)를 쓴다. 같은
`provider="google"` 아래 `providerAccountId` 공간이 통째로 다른 두 값 체계가 공존하는
셈이라, 유니크 인덱스(`provider`, `providerAccountId`)는 절대 충돌하지 않지만 — 바로 그래서
같은 사람이 웹으로 한 번, iOS 앱으로 한 번 로그인하면 서로 안 이어진 `app_user` 두 개가
조용히 생긴다. 노트/브레인/온보딩 상태가 계정별로 갈라진다는 뜻.

**최종 구현에서 낸 결론**: `provider`를 `"google_ios"`/`"apple_ios"`로 바꿔서 네이티브
로그인의 identity 공간을 웹과 의도적으로 분리했다. 이건 두 identity를 하나로 합치는
해법이 아니다 — 웹/iOS 양쪽으로 로그인한 사용자는 오늘 기준으로도 여전히 별개 계정을
얻는다. 다만 그 사실이 스키마에서 "실수로 안 이어진 버그"가 아니라 "의도적으로 분리해둔,
아직 병합을 안 한 상태"로 읽히게 만든다(`provider` 컬럼이 `google_ios`라고 문자 그대로
말해준다). 계정 병합/재사용 전략은 이 스펙의 범위가 아니고, **iOS 클라이언트가 실제로
출시되기 전에는 반드시 명시적으로 결정해야 하는 후속 항목**으로 남긴다 — 웹 Apple 로그인이
아직 없어(§2/로그인 폼 확인함, Google OAuth만 존재) Apple 쪽은 오늘 시점엔 이 충돌이
없지만, 나중에 웹 Apple 로그인이 생기면 똑같은 문제가 재현되므로 컨벤션은 미리 맞춰둔다.
