# admin 부스 관리 UX 정리 — 표 전환 + 위계 정리 + 대시보드 보강

**날짜**: 2026-08-15
**성격**: 결정 문서 + 구현 스펙. 선행: 2026-08-15 세션 admin 전체 IA+디테일 감사(대화 내 기록, 스크린샷
`/private/tmp/.../scratchpad/admin-audit-full/`).

## 배경 — 뭘 확인했고 뭘 안 바꾸는지

admin 사이드바 9개(개요·전시·부스·이벤트·분석·타임라인·계정·오류/이슈·디자인시스템)의 IA는 실제 운영
흐름(콘텐츠 만들기 → 모니터링 → 글로벌 관리 → 내부 참고)과 맞고, 배선도 코드로 확인됨(부스 태그→
`boothValueSlugs`→스코어링→피드 칩, 이벤트→부스 상세). **사이드바 구조는 그대로 둔다.**

감사에서 나온 5개 중 이번에 다루는 건 우선순위 1~3(+ 작은 보너스 2개). 분석 페이지 "인기 부스" 폰트
축소는 PLAUSIBLE(확정 버그 아님)이라 제외, 이벤트 생성 폼 날짜 입력 로케일은 커스텀 피커 없인 못
고쳐서 제외(YAGNI).

## Fix A — mock 환경 admin 락아웃 (버그, 최우선)

**파일**: `src/lib/api/http.ts`

**현재**(`isAdminAuthed`, 121~129행):
```ts
export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  if (hasAdminEmailGate) {
    const email = store.get(ADMIN_COOKIE)?.value?.toLowerCase();
    return !!email && adminEmailAllowlist.includes(email);
  }
  if (!env.ORGANIZER_CODE) return true;
  return store.get(ADMIN_COOKIE)?.value === env.ORGANIZER_CODE;
}
```
`AdminUnlock`의 `useGoogle = hasAdminEmailGate && hasSupabase`와 조건이 어긋난다 — Supabase 없으면
Google 로그인 자체가 안 뜨는데 게이트는 이메일만 인정해서, `ADMIN_EMAILS`가 설정된 채 로컬 mock
개발을 하면 admin에 아예 못 들어간다(오늘 직접 재현).

**변경**: 첫 줄 조건을 `hasAdminEmailGate && hasSupabase`로 — Supabase 없으면 이메일 게이트를
건너뛰고 기존 조직자 코드 게이트로 폴백.

**수용 기준**: `ADMIN_EMAILS` 설정 + Supabase 미설정(mock) 조합에서 조직자 코드로 정상 진입.
`hasSupabase`일 때는 기존과 동일(이메일만 인정).

---

## Fix 1 — 부스 관리를 표로 전환 + 검색·필터·정렬

**파일**: `src/components/admin/booth-manager.tsx`

**문제**: SIBF 기준 256개 부스를 카드로 쭉 나열 — 풀페이지 세로 30,183px. 검색·필터·정렬 없음(관련
state 자체가 코드에 없음, 직접 확인). 이미지 없는 부스도 카드 한 칸을 다 차지해 공간 낭비.

**변경**:
1. 카드 리스트 → `<table>` 기반 행 리스트. 컬럼: 썸네일(작게) · 이름/회사(세로 2줄) · 카테고리 칩 ·
   코드 · **완성도**(아래) · 수정/삭제 아이콘.
2. **완성도 컬럼** — 새로 만들지 않고 이미 있는 `src/lib/admin/data-issues.ts`의
   `findBoothEnrichmentGaps(booths)`를 재사용(CLAUDE.md "최소 필수 6종" 기준, `/admin/errors`
   "데이터 이슈" 탭과 같은 로직). 결측 0이면 "완료"(조용한 톤), 있으면 "미비 N"(강조 색).
3. **검색**: 이름·회사·코드 텍스트 입력, 대소문자 무시, `useMemo` 파생(클라이언트 필터 — 256개면
   충분히 가벼움, 서버 왕복 불필요).
4. **카테고리 필터**: 이미 import된 `Select` 재사용, 기본값 "전체 카테고리".
5. **"미비만 보기" 토글**: `findBoothEnrichmentGaps` 결과에 있는 boothId만 남김.
6. **기본 정렬**: `code` 자연 정렬(문자+숫자 혼합, 예 C02 < C10) — 없으면 이름순 폴백. 도면 들고
   대조하는 관리자 시나리오에 항상 유리해서 옵션 없이 기본값 자체를 교체.
7. 상단 카운트: "104개 부스" → 필터 적용 시 "12 / 104개 부스".
8. 필터 결과 0건이면 기존 `EmptyState` 재사용.

**안 바꾸는 것**: 삭제 `AlertDialog` 확인 흐름(이미 좋음), 수정 시트 자체(Fix 2에서 따로), URL 동기화는
안 함(로컬 state만 — 새로고침하면 리셋, 관리 화면이라 부담 없음).

**테스트**: `booth-manager.tsx`는 클라 컴포넌트라 로직만 분리 가능하면 분리해 유닛 테스트(자연 정렬
비교 함수, 검색 매칭 함수) 추가. 못 분리하면 최소한 자연 정렬 비교 함수만이라도 순수 함수로 빼서
테스트.

---

## Fix 2 — 부스 편집 시트 필드 위계 정리

**파일**: `src/components/admin/booth-manager.tsx` (245~395행 부근, 폼 렌더 부분)

**문제**: 필드 15개(이미지·부스명·부스코드·회사·카테고리·홀·설명·상세설명·태그·로고URL·인스타그램
URL·웹사이트URL·X좌표·Y좌표·인기도)가 전부 같은 무게로 나열. 카피만 고치려는 사람도 지도 배치용
좌표를 지나쳐야 한다.

**변경**: 3개 그룹으로 나눈다(같은 Sheet 안, 섹션 소제목 + 여백으로 구분):
- **기본 정보** (펼쳐짐): 이미지·부스명·부스코드·회사·카테고리·홀
- **콘텐츠** (펼쳐짐): 설명·상세설명·태그·로고URL·인스타그램URL·웹사이트URL
- **지도 배치** (수정 시 기본 접힘 / 생성 시 기본 펼침 — `<details>` 또는 로컬 state 토글):
  X좌표·Y좌표·인기도

수정(`startEdit`)은 좌표를 거의 안 건드리니 접어서 시작, 생성(`startCreate`)은 배치가 필수라 펼쳐서
시작.

**수용 기준**: 부스 이름/설명만 고치러 들어온 사람이 지도 좌표 필드를 안 보고도 저장까지 끝낼 수 있다.

---

## Fix 3 — 대시보드(개요)에 "확인할 것" 추가

**파일**: `src/app/admin/page.tsx`

**문제**: 통계 카드 3개 + 분석 링크 카드 1개 찍고 화면 나머지 완전히 빔. 로그인 직후 첫 화면인데
"지금 뭘 봐야 하는지" 신호가 없다.

**변경**: 기존 로직 재사용만 — 새 계산 로직 안 만든다.
- `repo.listIssues({ sinceDays: 30 })` → `groupIssues()` (이미 `/admin/errors`가 쓰는 것) → 묶음
  건수.
- `findBoothEnrichmentGaps(booths)` + `findNoteInconsistencies(notes)` (이미 있음) → 데이터 이슈
  건수.
- 카드 형태로 "오류 로그 N건" · "데이터 이슈 M건"을 통계 카드 grid 아래, 분석 링크 카드 위에 추가.
  각각 `/admin/errors`로 링크(탭 딥링크는 안 함 — Radix Tabs가 uncontrolled라 쿼리파람 연동은
  범위 밖, 페이지 가서 탭 클릭하면 됨). 0건이면 조용한 톤("문제 없음"), 있으면 강조 색.

**수용 기준**: 오류/데이터 이슈가 있을 때 대시보드에서 바로 보인다. 0건일 땐 "문제 없음" 톤으로 안심시킨다.

---

## Fix 4 (보너스, 작음) — 디자인 시스템 색상 스와치 대비

**파일**: `src/app/admin/design-system/page.tsx` (112행 부근, 스와치 렌더)

**문제**: `border border-border` 하나뿐이라 밝은 톤(Primary Foreground=흰색, Muted·Accent=연한 톤)이
흰 카드 배경과 거의 안 보임 — 팔레트 확인용 페이지에서 정작 팔레트가 안 보임.

**변경**: 스와치 바깥 래퍼에 체커보드 배경(`repeating-conic-gradient` 같은 흔한 패턴) 또는 살짝 어두운
중립 배경을 깔아, 흰색/거의 흰색 스와치도 경계가 보이게 한다.

---

## 검증 & 관례

```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- `/why`로 변경 이유 기록.
- Fix 1의 표 전환은 시각적 변경이 커서 `run` 스킬로 브라우저 확인 필수(mock 모드, `ADMIN_EMAILS=`
  오버라이드로 로그인).
