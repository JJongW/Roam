# 웰컴키트 저장 API — 인가 누락 + anon 키 쓰기 수정

**날짜**: 2026-08-19
**관련 파일**: welcome-kit/route.ts, supabase/repository.ts

## What — 무엇이 달라졌나
`PUT /api/booths/[id]/welcome-kit`(웰컴키트 저장)이 이제 관리자 인증을 확인하고,
Supabase에 쓸 때 서비스 롤을 쓴다. 지금까지 이 API를 부르는 화면이 어디에도 없어서
당장 실사용 영향은 없었다.

## Why — 왜 필요했나
어제(2026-08-18~19) 부스 저작 필드 기능을 만들면서 비슷한 쓰기(`upsertBoothEnrichment`)가
anon 키를 써서 RLS에 막혔을 버그를 최종 리뷰에서 발견해 고쳤는데, 그 리뷰가 "같은
패턴을 쓰는 `upsertWelcomeKit`도 의심해봐야 한다"고 짚었다. 실제로 확인해보니 이쪽은
문제가 하나 더 있었다 — `PATCH /api/booths/[id]`(부스 수정)는 `requireAdmin()`으로
서버측 인가를 확인하는데, 이 웰컴키트 저장 라우트는 그 확인 자체가 빠져 있었다.

## 판단 근거
지금 이 API를 부르는 프론트 화면이 없어서 즉시 악용 경로는 없지만, 관리자 콘솔에
웰컴키트 관리 화면이 붙는 순간 그대로 터질 문제라 미리 고쳤다. 두 가지 다 이미 검증된
같은 파일 안의 패턴을 그대로 재사용했다 — 인가는 `PATCH /api/booths/[id]`가 쓰는
`requireAdmin()`, Supabase 클라이언트는 `createBooth`/`updateBooth`가 쓰는
`createServiceClient()`. 새 패턴을 만들지 않고 이미 검증된 것에 맞췄다.
