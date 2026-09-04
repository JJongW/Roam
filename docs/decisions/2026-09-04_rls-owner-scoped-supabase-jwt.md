# 로그인 계정 데이터 RLS 잠금 + Apple 로그인을 Supabase Auth로 전환

**날짜**: 2026-09-04 (RLS), 2026-09-05 (Apple 로그인 방식 전환)
**관련 파일**: supabase/migrations/0041_rls_owner_scoped.sql, src/app/api/auth/apple/link/route.ts,
src/lib/auth/supabase-bearer-user.ts, src/lib/types/index.ts, src/lib/supabase/repository.ts,
src/lib/mock/repository.ts, src/lib/schemas/index.ts

## What — 무엇이 달라졌나
로그인 계정에 딸린 개인 데이터(닉네임·이메일, 부스별 메모, 행동 로그, 취향 프로필)가
이제 본인 것만 조회·수정 가능하도록 DB 단에서 막힌다. iOS의 Apple 로그인은 우리
서버가 아니라 Supabase Auth가 직접 검증하고 세션을 발급한다 — 로그인 이후 iOS는
그 세션으로 Supabase에 바로 접속해서 개인 데이터를 읽고 쓸 수 있다(요청한 "직접
연결"). 웹 로그인(닉네임/Google)은 지금까지처럼 서버 경유 그대로, 변화 없음.

## Why — 왜 필요했나
iOS를 Supabase에 직접 연결하는 방안을 검토하다가, DB의 행 단위 접근 정책(RLS)이
전부 "누구나 열람/수정 가능"으로 열려 있는 걸 발견했다. 확인해보니 이 접속 키(anon
key)는 이미 웹 프론트엔드 번들에 포함돼 배포되고 있어서(`src/lib/supabase/client.ts`,
Google 로그인/실시간 커뮤니티 피드용) — iOS를 새로 연결하기 전에 이미 지금
프로덕션에서 재현 가능한 문제였다.

## 판단 근거 — 왜 자체 JWT 브릿지 대신 Supabase Auth를 직접 쓰나
처음엔 서버가 검증한 로그인 결과를 자체 서명 JWT에 실어 auth.uid()만 채우는 더 작은
방식(JWT 브릿지)으로 시작했다. 그런데 이 방식은 ① 1시간마다 갱신을 iOS가 직접
챙겨야 하고 ② 로그아웃/탈퇴를 서버가 즉시 취소할 방법이 없고(만료까지 대기) ③ 서명
비밀키(SUPABASE_JWT_SECRET) 하나가 전체 계정 위조 키가 되는 구조였다. 반면 Apple
로그인 자체가 프로덕션에 아직 한 건도 없었다(`app_user` 25행 중 `provider='apple_ios'`
0건 — 이관 대상 자체가 없음)는 걸 확인한 뒤로는, 처음부터 Supabase Auth의
`signInWithIdToken`으로 로그인시키는 쪽이 이 세 가지 문제를 구조적으로 없앤다는 게
분명해져 전환했다: 토큰 갱신/취소는 Supabase SDK가 표준으로 처리하고, 우리가 관리하는
공유 비밀키 자체가 없어진다. 기존에 우리가 직접 하던 Apple JWKS 검증
(`verify-apple-token.ts`)은 그래서 삭제 — Supabase가 대신한다.

`app_user.id`를 Supabase의 `auth.uid()`와 같은 값으로 맞췄다(`OAuthIdentity.id` 필드
추가) — RLS의 `auth.uid() = user_id` 정책이 별도 매핑 없이 그대로 맞아떨어지게 하기
위해서다. 웹의 기존 Google 로그인(`auth/callback/route.ts`)은 이 필드를 안 쓴다 —
거긴 Supabase 세션을 곧바로 버리고 우리 자체 `app_user.id`로만 동작하는 원래 설계를
그대로 유지한다(로그아웃이 한 코드 경로로 유지되는 이유가 그 설계라 굳이 안 건드림).

`route_plan`/`bookmark`는 원래부터 로그인 계정이 아니라 익명 방문 세션 소유라 이번
범위에서 뺐다 — 오늘 발견한 문제(계정 데이터 유출)와 다른 얘기라서.

## 남은 작업 (프로덕션 DB/대시보드 직접 조작이 필요해 사용자 확인 필요)
- Supabase 대시보드(Authentication → Providers → Apple)에서 Apple 프로바이더를
  켜고, iOS 앱 번들 ID(`jw.romi.Roam`)를 네이티브 클라이언트로 등록.
- `supabase/migrations/0041_rls_owner_scoped.sql`을 프로덕션 Supabase SQL Editor에서
  실행(이미 실행했다면 뒤에 추가된 `user_exhibitor_judgment_history` REVOKE 한 줄만
  마저 실행).
- 로컬 `.env`의 `APPLE_BUNDLE_ID`/`SUPABASE_JWT_SECRET`은 이제 안 씀 — 지워도 됨.
- iOS 쪽(supabase-swift 추가, `signInWithIdToken` 호출, 세션을 Keychain에 보관하고
  로그인 성공 후 `/api/auth/apple/link`로 프로필 연결)은 별도 작업으로 아직 미착수.
