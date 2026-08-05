# 지도 로미 존재감 — 반응 즉답 고도화 Design

**Goal:** 지도에서 부스에 반응(끌림/별로)할 때 뜨는 로미 즉답을, 그 부스의 실제 분야와
사용자의 누적 확신도에 따라 톤이 달라지는 문장으로 바꾼다. 반응 1회로 취향 전체를
단정하지 않고, 신호가 쌓일수록 조심스러움에서 확신으로 옮겨가게 한다.

**Architecture:** 브레인의 `interests`(분야 slug별 confidence, 이미 존재·이미 정렬됨)를
전시 홈이 서버에서 읽어 컴패니언 스토어에 얹어두고(기존 `HomeCompanionContextBridge`
패턴 재사용), 지도의 반응 버튼은 그 스토어 값 + 부스의 `tags`(분야, 항상 채워짐)를
클라이언트에서 매칭해 즉시(네트워크 없이) 문장을 조립한다. 새 백엔드·새 DB 컬럼 없음.

**Tech Stack:** 기존 zustand 컴패니언 스토어, 기존 i18n 딕셔너리, `sonner` 토스트.

## Global Constraints

- 탭(반응) 즉답은 여전히 0-latency여야 한다(LLM·서버 왕복 금지) — CLAUDE.md "탭엔 LLM 금지"
- 로미 발화에 추상 가치 이름(발견·경험·휴식…)을 쓰지 않는다 — 분야(`booth.tags`, 카테고리
  slug)만 말한다. valueTags/themeTags(저작 필드, 커버리지 16~66%)는 이번 스코프에서 안 씀
- 반응 1회로 분야 전체를 단정하지 않는다 — 별로(skip) 문장은 항상 "안에서도 다는 아니다"
  로 헤지한다(부스 하나 뺐다고 분야 전체를 부정하지 않는다, `reaction-bar.tsx` 기존 교훈)
- 확신 임계값은 기존 값 0.25 그대로 재사용(taste.ts·curate.ts와 동일) — 새 임계값 안 만듦
- 지도 화면 "상단바 없음" 원칙(`docs/ai-companion-ux-writing-patterns.md:379`)을 깨는 상시
  플로팅 아바타는 추가하지 않는다

---

## 배경 조사에서 확인한 것

- `brain.interests[]`(분야 slug 또는 가치 slug, confidence 내림차순 정렬, `distill.ts`)가
  이미 필요한 신호다. 새 계산 불필요.
- `booth.tags`는 카테고리 slug이자 100% 채워지는 필드(enrichment의 `themeTags`/`valueTags`는
  16~66%만 채워짐) — 매칭은 반드시 `booth.tags`로 한다.
- 지도 로딩 애니메이션(로미 걷는 영상)은 **이미 존재**한다
  (`src/components/common/loading-screen.tsx:28`, `RoamMotion pool={THINKING_POOL}`,
  `map/loading.tsx`가 이미 이걸 렌더). 새로 안 만든다 — 라우터 캐시로 순간 이동하면
  로딩 경계가 아예 안 뜨는 경우가 있어 "못 본" 것뿐일 수 있다. 구현 마지막에 실제로
  뜨는지 눈으로 한 번 확인한다(코드 변경 없음, 확인만).
- 지도의 "상주 아바타"는 상단바 없음 원칙과 부딪혀서, 새 플로팅 아이콘 대신 반응
  토스트 자체에 작은 로미 얼굴을 붙이는 것으로 대체한다.
- 온보딩 카드(`ValueOnboarding`)의 걷는 로미 영상은 하단 상주 필(정적 로고)과 용도가
  달라(대화 시작 진입점 신호) 그대로 둔다 — 변경 없음.

---

## 컴포넌트

### 1. `src/lib/stores/companion.ts` (수정)

`interests` 필드 추가:

```ts
interface CompanionInterest {
  key: string; // 분야 또는 가치 slug
  label: string;
  confidence: number; // 0..1
}

interests: CompanionInterest[];
setInterests: (interests: CompanionInterest[]) => void;
```

초기값 `[]`. `setTaste`와 같은 생명주기(화면을 벗어나도 안 비움) — 지도가 전시 홈을
떠난 뒤에도 값을 써야 하기 때문. `setHome`처럼 언마운트 시 null로 되돌리지 않는다.

### 2. `src/components/companion/home-companion-context.tsx` (수정)

`interests: CompanionInterest[]` prop 추가, effect에서 `setInterests(interests)` 호출
(cleanup 없음, 위 생명주기 결정과 동일).

### 3. `src/app/(visitor)/exhibitions/[slug]/page.tsx` (수정)

`HomeCompanionContextBridge`에 `interests={brain?.interests ?? []}` 전달. `brain`은
이미 이 페이지가 읽고 있어(줄 68) 새 조회 없음.

지도로 바로 딥링크(공유 링크, 새로고침)해 이 세션에서 전시 홈을 한 번도 안 거친
경우엔 스토어의 `interests`가 비어 있다 — 그럴 땐 아래 4번이 항상 매칭 실패로 자연
낙하해 기존 문장(분야 언급 없음)을 쓴다. 별도 처리 없음(의도된 단순화).

### 4. `src/lib/companion/reaction-line.ts` (신규, 순수 함수)

```ts
export type ReactionKey = "interested" | "later" | "skip" | "seen";

export function buildReactionLine(
  key: ReactionKey,
  booth: Pick<Booth, "tags">,
  boothName: string | undefined,
  interests: CompanionInterest[],
  t: TFn,
): string | null
```

로직:
- `later`·`seen`은 기존 `reactionLine()` 그대로(변경 없음) — later는 판정 가중치가
  interested의 0.3배라 "확실히 좋아하는구나" 톤을 쓰면 신호보다 말이 앞선다.
- `interested`·`skip`만 아래 매칭을 탄다:
  - `match = interests.find(n => booth.tags.includes(n.key))` — `interests`가 이미
    confidence 내림차순이라 첫 매치가 곧 최고 확신 분야.
  - 매치 없음 → 기존 문장(`reactInterested`/`reactSkip`) 그대로.
  - `interested` + 매치 있음 + `confidence < 0.25` → `reactInterestedTentative(Plain)`.
  - `interested` + 매치 있음 + `confidence >= 0.25` → `reactInterestedConfident(Plain)`.
  - `skip` + 매치 있음 + `confidence >= 0.25` → `reactSkipConfident(Plain)`.
  - `skip` + (매치 없음 또는 `confidence < 0.25`) → 기존 `reactSkip(Plain)` 그대로
    (uncertain 분야를 걸러낸 부스에 벌점 없는 것과 같은 비대칭, taste.ts와 동일 철학).

`reaction-bar.tsx`의 기존 `reactionLine()` 함수는 이 모듈로 대체(호출부만 교체, 로직
이동).

### 5. `src/lib/i18n/dictionaries.ts` (수정 — ko/en 둘 다)

```
reactInterestedTentative: "‘{booth}’, 기억해둘게 — ‘{theme}’ 쪽에 관심 있나 봐."
reactInterestedTentativePlain: "‘{theme}’ 쪽에 관심 있나 봐."
reactInterestedConfident: "‘{booth}’도 그렇고, ‘{theme}’ 확실히 좋아하는구나."
reactInterestedConfidentPlain: "‘{theme}’ 확실히 좋아하는구나."
reactSkipConfident: "‘{booth}’는 아니었구나. ‘{theme}’ 안에서도 다 취향은 아닌가 봐."
reactSkipConfidentPlain: "‘{theme}’ 안에서도 다 취향은 아닌가 봐."
```

영문(en):
```
reactInterestedTentative: "“{booth}” — noted. Looks like {theme} is catching your eye."
reactInterestedTentativePlain: "Looks like {theme} is catching your eye."
reactInterestedConfident: "“{booth}” fits too — you really go for {theme}."
reactInterestedConfidentPlain: "You really go for {theme}."
reactSkipConfident: "“{booth}” wasn't it. Guess not every {theme} booth is your thing."
reactSkipConfidentPlain: "Guess not every {theme} booth is your thing."
```

### 6. `src/components/companion/roam-avatar.tsx` (신규 — 추출)

`companion-bar.tsx`에 있던 `RoamAvatar()`를 별 파일로 옮긴다(지도 토스트도 써야 해서
두 곳 임포트 필요 — 복붙 대신 공유). `companion-bar.tsx`는 새 경로에서 import.

### 7. `src/components/map/map-view.tsx` (수정)

`toast(flash)` → `toast(flash, { icon: <RoamAvatar className="size-5" /> })`.
반응이 있을 때만(토스트가 뜰 때만) 로미 얼굴이 보인다 — 상시 아이콘 없음.

---

## 에러 처리 / 엣지 케이스

- `interests`가 빈 배열(딥링크 직행, 신규 유저) → 항상 매치 없음 → 기존 문장. 정상 동작.
- 한 부스가 여러 분야 tag를 가지면 → 그중 confidence 최고인 것 하나만 말한다(여러 분야
  나열 안 함 — 문장이 길어지고 "안다"는 느낌이 흐려진다).
- `booth.tags`가 빈 배열인 시설 부스(kind: "facility") → 매치 없음 → 기존 문장.

## 테스트

- `src/lib/companion/reaction-line.test.ts` (신규) — `grounding.test.ts` 패턴 참고.
  케이스: 매치없음/tentative/confident 각 interested, skip의 confident-only 분기,
  later·seen은 항상 기존 문장 그대로, 매치 여러 개 중 최고 confidence 선택.
- 기존 `reaction-bar.tsx` 관련 테스트(있다면) 회귀 확인.
- 수동: 지도에서 로딩 화면이 실제로 뜨는지 눈으로 1회 확인(코드 변경 아님).
