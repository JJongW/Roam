# Google 소셜 로그인 (Supabase Auth)

기존 닉네임 무비번 계정 위에 **Google OAuth**를 얹었다. Supabase Auth로 OAuth·토큰
교환만 처리하고, 신원은 앱이 원래 쓰던 `app_user` + `roam_user` 쿠키로 통일한다.

## 왜 이 구조
- 앱은 이미 Supabase(Postgres) + 커스텀 쿠키 신원(`roam_session`/`roam_user`)을 씀.
  Supabase **Auth 세션을 새 신원 축으로 추가하면 신원 시스템이 둘**이 된다.
- 그래서 콜백에서 Supabase 세션은 **identity를 읽는 순간만** 쓰고 `signOut`으로 버린다.
  로그인 성공의 결과물은 오직 `roam_user` 쿠키 → 로그아웃·`/api/auth/me`·노트 로딩
  전부 기존 경로 그대로.

## 흐름
1. `LoginSheet` "Google로 계속하기" → `supabase.auth.signInWithOAuth({provider:"google",
   redirectTo:/auth/callback?next=<현재경로>})`.
2. Google 동의 → `/auth/callback?code=...`(`src/app/auth/callback/route.ts`):
   `exchangeCodeForSession` → `getUser` → `getUserByProvider("google", sub)`,
   없으면 `uniqueNickname`(이름/이메일→규격화→중복 시 suffix) + `createOAuthUser`.
   → `setUserCookie` → `supabase.auth.signOut` → `next`로 redirect.
3. 홈 복귀 → `AuthBootstrap`이 `/api/auth/me`로 store 갱신. 실패 시 `?login_error=`
   → 토스트.

## 코드
- 마이그레이션 `supabase/migrations/0018_oauth_accounts.sql` — `app_user`에
  `provider/provider_account_id/email/avatar_url` + `(provider, provider_account_id)`
  부분 unique 인덱스.
- 타입 `User`(+`provider/email/avatarUrl`), `OAuthIdentity` — `src/lib/types/index.ts`.
- Repo: `getUserByProvider`·`createOAuthUser`(mock + supabase).
- 닉네임 생성 `src/lib/auth/oauth-nickname.ts`(`loginSchema` regex 준수, 중복 dedupe).
- mock 모드(Supabase 키 없음)에선 Google 버튼 숨김 → 닉네임 로그인만.

## ⚠️ 수동 설정 (코드 밖, 배포 전 필수)
1. **Google Cloud Console** → OAuth 2.0 클라이언트 ID 생성(웹).
   - 승인된 리디렉션 URI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. **Supabase 대시보드** → Authentication → Providers → **Google** 활성화 →
   위 client ID / secret 입력.
3. Supabase → Authentication → URL Configuration:
   - Site URL: 프로덕션 URL
   - Redirect URLs 허용목록에 추가:
     `http://localhost:3000/auth/callback`, `https://<prod>/auth/callback`
4. 설정 전엔 버튼 눌러도 provider 미구성으로 실패(→ `login_error` 토스트). 정상.

## 로그인 필수 게이트 (2026-07-07 추가)
앱을 로그인 없이는 못 쓰게 요구 → 방문객 앱 전체를 인증 뒤로.
- **게이트** `src/proxy.ts`(Next 16 `proxy` 컨벤션, 구 `middleware`). `roam_user`
  쿠키 없으면 `/login?next=<원래경로>`로 307. matcher가 `api`·`_next`·정적파일 제외.
- **예외 프리픽스**: `/login`(게이트 자신), `/auth`(OAuth 콜백), `/admin`(주최자 콘솔은
  `roam_admin` 코드 게이트라는 **별도 신원** — 이중 게이트 안 함).
- **로그인 화면** `src/app/login/`(page + login-form). Google + 닉네임. 성공 시
  `next`로 하드 내비게이션(쿠키로 게이트 재평가). 실패는 `/login?login_error=`.
- **공유 링크 `/r/[shareId]`도 게이트**(사용자 요구). 비로그인 수신자는 로그인 후 열람.
- **범위 결정**: API는 게이트 안 함(로그인 엔드포인트가 막히면 안 되고, 각 라우트가
  자체 세션/쿠키 검증). "사용 못 하게"=UI 접근 차단으로 해석. 익명 세션
  인프라(`roam_session`/`ensureSession`)는 제거 없이 공존.

## 안 건드린 것
- `app_user`는 시드 대상이 아니므로 `seed.sql`/`gen-seed.mjs` 재생성 불필요.
- 비밀번호·다른 provider(Apple/Kakao)는 범위 밖. 추가 시 provider 슬러그만 확장하면
  콜백은 generic(=`app_metadata.provider` 사용)이라 재사용 가능.
