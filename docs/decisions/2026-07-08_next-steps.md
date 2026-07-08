# 다음 작업 정리 (핸드오프)

_2026-07-08 · 세션 중단 시점. 아래 미완 작업을 다음에 이어서._

## 이번 세션에 main 머지 완료 (참고)

- 앱 최초진입 온보딩 **이미지형 슬라이드 캐러셀**(#52) — 큰 로고 영상 히어로 + 도트 + 다음.
- 컴패니언 바 **홈에서 숨김**(#52) — 전시 내부 여정에서만.
- **지도 부스 색칠 회귀 복구 + 뒤로가기 → 전시**(#53). ⚠️ 근본 원인 기록: `setFromNotes`가
  매 페이지 로드마다 records를 서버 노트로 **교체**해 로컬 반응 상태를 지웠음 → **병합**으로 고침.
  (`src/lib/stores/visit.ts`). 앞으로 로컬 전용 상태 추가 시 이 병합 규칙 주의.
- 저작 enrichment 16부스 + Supabase 근거필드 매핑 + 전체 플로우 검증(#51).

## 남은 작업 (우선순위/의존순)

### 1. i18n — 언어 선택(ko/en) + 핵심 화면 번역 **[가장 기반]**
- 첫 진입 언어 선택(한국어/English). locale 쿠키(`roam_lang`) + 사전 + `t()` 인프라.
- 서버(next/headers cookies)·클라(context) 공유. 언어 게이트는 로그인 위/전역.
- 핵심 방문객 흐름부터 번역: 언어 게이트·로그인·온보딩 캐러셀·홈·전시·피드·컴패니언·회고·
  가치/리듬 라벨·근거 카드. **부스 콘텐츠(요약·근거)는 한국어 데이터라 미번역**(MVP 허용).
- 가치/리듬 라벨은 데이터라 `labelEn` 추가 + `valueLabel(slug, locale)` 필요.
- ⚠️ 착수분 있음: `src/lib/i18n/config.ts`가 **git stash**에 있음(`git stash list` → feat/i18n-romi
  WIP). 이어서 하려면 pop. 아니면 재작성(내용 간단: Locale·LOCALES·쿠키명·라벨).
- 규모 큼 → 인프라+엔트리 플로우 먼저, 나머지 화면 점진.

### 2. 캐릭터 네이밍 Romi/로미 (i18n과 함께)
- **서비스 = Roam**(헤더 로고·로그인·manifest 유지). **캐릭터(동행자) = Romi / 한국어 로미**.
- 교체 대상(캐릭터 자기지칭·라벨): 온보딩 "나는 Roam이야"→"나는 로미야", 피드 `<span>Roam</span>`
  →로미, 컴패니언 "Roam한테 물어보기"→"로미한테", value-onboarding "안녕, 나는 Roam이야",
  persona 문서. 위치는 `grep -rn "Roam이야\|>Roam<\|Roam한테\|Roam ·"`로 확인됨.
- i18n 사전에 ko="로미"/en="Romi"로 넣으면 한 번에 해결.

### 3. 마이페이지 — 내 관심 가치 마인드맵(보기/수정)
- "로그인한 것 같지 않은 UI" 해소. 온보딩에서 고른 가치를 **컴팩트·예쁜 마인드맵/다이어그램**
  으로(중심 로미 노드 → 가치 노드, confidence로 크기). 탭으로 추가/삭제 수정.
- 기존 `src/components/me/brain-sheet.tsx`(현재 Progress 바 리스트) 업그레이드 or 신규.
  진입은 `AccountButton`(닉네임 탭 → BrainSheet 이미 연결됨). `GET /api/me/brain` 사용.
- 수정 저장: `POST /api/me/values`(가치 시드) 재사용 가능.

### 4. 홈 — 로미의 전시 선택 안내 + 추천 강조
- 멀티 전시 플랫폼 전제. 홈에서 로미가 전시 선택 안내(인사 한 줄) + 사용자 가치 기반 추천
  전시 **강조(테두리/배지)**. `ExhibitionCard`에 `recommended` prop 추가.
- ⚠️ 현재 mock 전시는 SIBF 1개(카테고리 slug와 혼동 주의). 추천 로직은 1..N 대응으로.
- 컴패니언 바는 홈에서 숨김 상태(이미 반영) — 홈은 이 가이드로 대체.

## 검증 규칙(변경 후)
`npx tsc --noEmit` · `npx vitest run` · `npx eslint <changed>` · mock 브라우저 e2e.
mock dev: `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= GEMINI_API_KEY= npx next dev -p 3100`
