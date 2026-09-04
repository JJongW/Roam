# 로그인 계정 데이터 RLS 잠금 + Supabase JWT 브릿지

**날짜**: 2026-09-04
**관련 파일**: supabase/migrations/0041_rls_owner_scoped.sql, src/lib/auth/supabase-jwt.ts,
src/lib/env.ts, src/app/api/auth/apple/native/route.ts, src/app/api/auth/me/route.ts

## What — 무엇이 달라졌나
로그인 계정에 딸린 개인 데이터(닉네임·이메일, 부스별 메모, 행동 로그, 취향 프로필)가
이제 본인 것만 조회·수정 가능하도록 DB 단에서 막힌다. 정상적으로 로그인해서 쓰는 데는
아무 변화 없다 — 지금까지도 실제 서비스(웹·API)는 전부 서버를 거쳐서 접근했기 때문.

## Why — 왜 필요했나
iOS를 Supabase에 직접 연결하는 방안을 검토하다가, DB의 행 단위 접근 정책(RLS)이
전부 "누구나 열람/수정 가능"으로 열려 있는 걸 발견했다. 이 프로젝트에 데이터를 여닫는
빗장이 원래 "서버 코드가 알아서 걸러준다"는 전제였는데, 그 앞단을 거치지 않고 DB
접속 키만 가지고 있으면 바로 뚫리는 구조였다. 확인해보니 이 접속 키(anon key)는
이미 웹 프론트엔드 번들에 포함돼 배포되고 있어서(`src/lib/supabase/client.ts`,
Google 로그인/실시간 커뮤니티 피드용) — iOS를 새로 연결하기 전에 이미 지금
프로덕션에서 재현 가능한 문제였다.

## 판단 근거
DB에 계정과 auth.uid()를 연결하는 정식 인증 마이그레이션(Supabase Auth로 전체
전환)까지 가지 않고, 서버가 이미 검증 끝낸 로그인 결과(app_user.id)를 실어 보내는
자체 JWT 하나로 auth.uid()를 채우는 쪽을 택했다 — 기존에 이미 검증되고 있는 Apple
로그인 로직, app_user 스키마를 전혀 안 건드리고 RLS 정책만 다시 쓰면 되기 때문.
`route_plan`/`bookmark`는 원래부터 로그인 계정이 아니라 익명 방문 세션 소유라 이번
범위에서 뺐다 — 오늘 발견한 문제(계정 데이터 유출)와 다른 얘기라서.

## 남은 작업 (이 커밋에 안 포함됨, 프로덕션 DB/시크릿 직접 조작이 필요해 사용자 확인 필요)
- Supabase 대시보드(Settings → API → JWT Settings)에서 JWT secret을 가져와
  `SUPABASE_JWT_SECRET`으로 로컬 `.env`와 Vercel 프로덕션 환경변수에 추가.
- `supabase/migrations/0041_rls_owner_scoped.sql`을 프로덕션 Supabase SQL Editor에서
  직접 실행(이 레포는 `supabase/` 전체가 gitignore 대상이라 마이그레이션 파일 자체는
  커밋되지 않음 — 기존 컨벤션 그대로).
- iOS 쪽(supabase-swift 연결, 발급받은 JWT를 Keychain에 저장하고 만료 전 `/api/auth/me`로
  갱신)은 별도 작업으로 아직 시작 안 함.
