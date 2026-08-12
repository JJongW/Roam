# R3 — 카피라이팅 변주 엔진 ("사람처럼")

**날짜**: 2026-08-12
**성격**: 설계 문서 — 미착수(로미 개선 브리프 §3 R3).
**관련 파일**: `src/lib/companion/reaction-line.ts`, `src/lib/i18n/resolve.ts`(`getPath`), `src/lib/i18n/dictionaries.ts`, `src/lib/feed/curate.ts`(`createLinkPicker` — 재사용 대상), `docs/ai-companion-ux-writing-patterns.md`(갱신 대상)

## 배경 — 조사 결과: 이미 절반은 있다

브리프는 "변주 엔진을 만들자"고 하지만, 실제로 확인해보니 **변주 자체는 이미 있다**:

- `dictionaries.ts`의 `Dict` 타입은 리프 값이 `string | readonly string[]`를 허용한다(`resolve.ts`).
- `getPath`(`resolve.ts:9`)는 배열이면 `Math.floor(Math.random() * v.length)`로 매번 무작위 하나를 고른다.
- `reactMust` 등 판단 반응 키(`reaction-line.ts`가 참조하는 `companion.react*`)는 **이미 3~4개씩 변주 문구가 들어있다**(`dictionaries.ts:470` 근방).

그러니 이번 설계는 "0에서 엔진을 만든다"가 아니라, **기존 변주 시스템에 브리프가 지적한 두 가지 빠진 조각을 추가**하는 것이다:

1. **반복 회피 없음** — 무작위라 방금 나온 문구가 바로 다음에 또 나올 수 있다(4개 중 1/4 확률로 즉시 반복).
2. **구체 참조가 {booth}/{theme}뿐** — "실제 과거 반응"(예: "아까 A부스 좋아했잖아, 이것도 비슷한 결이야")은 판단 반응 문구엔 없다. 이 패턴 자체는 이미 다른 곳에 있다: `curate.ts`의 `createLinkPicker`(피드 카드의 "왜 지금 너한테" 근거 절)가 정확히 이 역할을 한다 — 최근 긍정 반응 부스를 찾아 인용한다. 판단 반응 문구엔 이게 아직 안 붙어 있을 뿐이다.

## 목적

1. 같은 반응 키가 연속으로 같은 문구를 내지 않는다.
2. 판단 반응 문구(`buildJudgmentLine`)에도 "아까 그거랑 비슷해" 같은 구체 참조를 가끔 얹는다(항상은 아니다 — 매번 참조하면 오히려 부자연스럽다).

## 설계 — 1. 반복 회피

**옵션 비교**:
- **A. `getPath`에 전역 "최근 사용" 캐시**(모듈 레벨 `Map<path, lastIndex>`) — 구현은 간단하지만 `getPath`는 서버·클라이언트 양쪽에서 호출되는 순수 함수 취급을 받는 자리라(i18n 공용 유틸), 여기 상태를 넣으면 SSR 요청 간 상태가 새고(서버는 여러 요청을 한 프로세스가 처리) 순수성이 깨진다.
- **B. 컴패니언 스토어(`useCompanionStore`, 클라이언트 전용)에 "키별 마지막 인덱스" 기록** — `say`/`saySpontaneous`가 이미 클라이언트 상태(마지막 발화 시각 등)를 관리하는 자리라 자연스럽다. `buildJudgmentLine`을 호출하는 `judgment-bar.tsx`가 이미 `useCompanionStore`를 쓰고 있어 배선도 짧다.
- **권장: B.** `getPath`(i18n 유틸)는 순수하게 남기고, "반복 회피"라는 상태는 원래 상태를 갖는 컴패니언 스토어로 옮긴다. 구체적으로: `getPath`가 인덱스 선택 로직을 옵션으로 받게 확장하거나(`pickVariant(pool, avoidIndex)` 별도 순수 함수 분리), `reaction-line.ts`가 스토어에서 "이 키 마지막으로 뭘 썼는지"를 읽어 그 인덱스를 피하는 산출 로직을 감싼다.

## 설계 — 2. 구체 참조 얹기

`buildJudgmentLine`에 새 선택적 파라미터 `recentPositive?: { boothName: string }` 추가. 호출부(`judgment-bar.tsx`)가 이미 갖고 있는 `useVisitStore`의 최근 긍정 반응(`interest === "must"`) 중 하나를 넘긴다 — `curate.ts`의 `positiveNotes`/`createLinkPicker`와 같은 선택 규칙(verdict가 있으면 verdict 우선, `bad`는 절대 긍정으로 안 씀)을 여기서도 그대로 따른다(중복 구현이 아니라 로직을 공유 함수로 뽑아 `curate.ts`와 `reaction-line.ts` 둘 다 참조하는 게 정확하다 — 지금 `positiveNotes`가 `curate.ts`에만 있어서 이번에 `src/lib/companion/` 또는 공용 위치로 옮기는 작은 리팩터가 필요).

**얼마나 자주 참조를 넣나**: 매번이 아니라 확률적으로(예: 30~40%) — 브리프의 "너는 [성향]이니까 [행동], 이유는 [근거]" 패턴에서 "이유"를 항상 과거 참조로 채우면 반복 자체가 새로운 반복 패턴이 된다. 근거가 있을 때만, 그리고 매번은 아니게.

## 설계 — 3. `docs/ai-companion-ux-writing-patterns.md` 갱신

브리프가 지적한 대로 이 문서는 2026-07-11자라 구 어휘를 쓴다(`끌림`·`나중에`·`별로`·`이미 봄` — 확인함, 467~493번 줄). 신 어휘(interest: 꼭 갈래·끌려·패스, verdict: 좋았어·그냥·아니)로 용어만 치환하면 된다 — 이 문서가 설명하는 *원칙*(패턴 포뮬러, 헤지 규칙 등)은 이미 `reaction-line.ts`의 실제 구현과 일치해서 안 바뀐다. 코드 변경이 아니라 **문서 갱신 태스크**로 별도 처리 가능(R3 나머지와 독립적, 먼저 해도 됨).

## 수용 기준

- 같은 반응 키가 연속 2회 호출될 때, 4개 변주 풀 기준 반복 확률이 25%(무작위) → 0%(회피 성공 시)로 낮아진다. 풀이 1개뿐인 키는 회피 대상에서 자동 제외(피할 게 없음).
- `recentPositive`가 있을 때만 참조가 붙고, 없으면 지금과 동일한 문구(참조 없는 기본형)로 폴백 — 없는 참조를 지어내지 않는다.
- 유닛 테스트: `pickVariant`류 순수 함수(반복 회피 로직)와 `buildJudgmentLine`의 참조 삽입 분기 둘 다 커버.

## 리스크 / 미해결

- 반복 회피 상태를 컴패니언 스토어에 두면 **세션이 끝나면(새로고침) 리셋**된다 — 완전한 반복 회피가 아니라 "같은 세션 안에서만" 효과. 브리프 요구가 "느껴지지 않게"이므로 세션 단위로 충분해 보이지만, 확정은 아님.
- `createLinkPicker`/`positiveNotes`를 `curate.ts`에서 공용 위치로 옮기는 리팩터가 이 작업에 딸려 온다 — R3 자체보다 범위가 살짝 넓어진다. 별도 선행 태스크로 쪼갤지, R3 안에 포함할지는 구현 시작 시 판단.
