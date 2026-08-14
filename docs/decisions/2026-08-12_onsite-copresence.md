# 관람 중 co-presence — 현장에서 로미를 살린다

**날짜**: 2026-08-12
**관련 파일**: `map-view.tsx`, `companion-bar.tsx`, `stores/companion.ts`(say/flash), `stores/visit.ts`, `companion/reaction-line.ts`, `feed/cue.ts`(deriveCue), `i18n/dictionaries.ts`, (신규) `lib/companion/copresence.ts`
**성격**: 결정 문서 + 구현 스펙 (Claude Code 실행용). 선행: `2026-07-07_companion-reframe.md`, `2026-08-10_judgment-vocabulary.md`, `docs/ai-companion-ux-writing-patterns.md`.

## What — 무엇이 달라지나

관람 **전(피드)**에 몰려 있던 로미의 발화를 관람 **중(현장·지도)**으로 확장한다. 사용자의 실시간 행동
—부스 탭, interest/verdict 반응, 검색, 관심 부스 미방문 이탈—을 트리거로 로미가 **적시에 한 줄** 말한다.
로미의 무게중심을 "미리 골라둔 목록"에서 "지금 너랑 같이 걷는 중"으로 옮긴다.

## Why — 왜 필요한가

"같이 본다"는 느낌은 정보량이 아니라 **적시의 반응**에서 온다 — 지금 내가 뭘 보는지에 반응하고, 아까
내가 한 걸 기억하고, 내가 밀면 바뀌는 것. 그런데 지금 로미가 가장 똑똑한 순간은 관람 전 피드이고,
정작 "같이 걷는" 느낌이 필요한 현장에서는 지도가 컴패니언 바를 숨겨(`map-view.tsx`) 로미가 조용하다.
발화 채널(`say()`→`flash`→토스트)은 이미 있는데 트리거가 **반응 즉답 하나뿐**이다. 트리거를 늘려
현장을 살린다.

## 판단 근거

- **실내 위치추적이 없어도 된다.** 사용자의 행동이 곧 위치 신고다(부스 탭 = "나 지금 여기 봐"). 새 인프라
  0으로 공동주의(shared attention)를 만든다.
- **한 줄이 두 일을 한다.** 최고의 발화는 *기억 + 근거(사실) + 후회방지*를 한 문장에 담는다 —
  예: "아까 ○○ 좋아했잖아, 여기 바로 옆인데 5시 사인회 있어. 놓치면 아쉬울걸." co-presence(같이 봄)와
  utility(도움 됨)를 동시에 터뜨리는 지점. 공동주의만 있으면 챗봇, 유용성만 있으면 검색엔진이다.
- **나그지 않기(don't nag)가 생사를 가른다.** 자발 발화엔 **빈도 상한**이 필수. "적시"가 "많이"보다 중요하다.
- **틀림 인정은 싸고 임팩트가 크다.** `2026-08-10_judgment-vocabulary`가 interest×verdict로 "예측이
  틀렸음"을 *데이터로는* 가능케 했다. 남은 건 로미가 **입으로 인정하는 발화**뿐이다.
- **speed rule 준수.** 전부 결정론(`say()`/`flash`), 핫패스 LLM 0. `thinkingBudget=0` 무관(호출 없음).

---

## 스펙

### 1. 발화 채널 (기존 재사용)

`useCompanionStore.say(text)` → `flash` 세팅 → 전시 홈은 `companion-bar`가, 지도는 `map-view`가 토스트로
소비(이미 구현됨). **신규 트리거는 전부 이 채널로만** 발화한다. 새 UI 없음.

### 2. 현장 트리거 표

| # | 트리거 | 조건 | 발화 의도 | 재료(저작 0) |
|---|---|---|---|---|
| T1 | 지도에서 부스 선택 | 부스 select, 과거 긍정 반응과 가치 겹침 | "여기, 네 결이랑 비슷해" | `records`(must/curious/good) + `boothValueSlugs` 겹침 + 카테고리 라벨 |
| T2 | 부스에 이벤트/타이밍 임박 | 선택 부스에 `deriveCue` 결과 있음 | "옆 ○○ 5시 사인회, 놓치면 아쉬울걸" | `cue`(실제 사실) |
| T3 | interest/verdict 반응 | 버튼 탭 | 이미 있음(`buildJudgmentLine`) | — (상한 제외, §4) |
| T4 | **틀림 인정** | `verdict=bad` & 직전 `interest∈{must,curious}` | "내가 이거 좋아할 줄 알았는데 아니었네. 하나 배웠다." | `records` 직전 interest |
| T5 | 관심 부스 미방문 이탈 | `interest=must`인데 방문/verdict 없음 + 마치기 시도 or 반대 방향 이동 | "꼭 간다던 ○○ 아직 안 갔어" | `records` |
| T6 | 검색 첫 결과 | 검색 실행 | "이건 어때 — 네가 ~한 결이라" | 검색어 + 과거 반응 |
| T7 | (선택, out-of-scope) 실시간 dwell | 한 구역 장기 체류 | "여기 마음에 드나 보네" | ⚠️ **실시간 체류 계측 신규 필요** — 이 문서 밖 |

T1·T2·T5는 **자발(unprompted)** → §4 상한 적용. T3·T4·T6은 사용자가 직접 유발 → 상한 제외.

### 3. 발화 조립 규칙 — "한 줄이 두 일"

신규 순수 함수 `lib/companion/copresence.ts`에 조립기를 둔다(테스트 가능, LLM 없음):

```
buildCopresenceLine(trigger, { booth, records, interests, cue, categoryLabel, t }) → string | null
```

- **우선순위**: 실제 사실(cue/이벤트/위치) > 기억(과거 반응 겹침) > 일반. 가능하면 `[기억 절] + [사실 절]`을
  결합, 하나만 있으면 그것만. **둘 다 없으면 `null`(발화 안 함) — 억지 발화 금지.**
- **가치 이름 금지, 카테고리 라벨(분야)만** 발화에 얹는다 — `reaction-line.ts`의 "매칭 축(가치 slug) vs
  발화 축(카테고리 라벨) 분리" 규약을 그대로 따른다.
- **후회방지 절**("놓치면 아쉬울")은 **실제 임박 사실**(T2 cue 등)이 있을 때만. 근거 없이 붙이면 조작이다.
- 톤: `ux-writing-patterns.md` — 관찰·제안(명령 아님)·불확실성 인정. 마케팅 문구·"AI가 분석했어요" 금지.

### 4. 나그지 않기 — 빈도 상한 (필수)

`stores/companion.ts`에 자발 발화 게이트를 추가한다:

- **쿨다운**: 자발 발화(T1·T2·T5)는 최소 간격을 둔다(제안: `≥ 45초` 또는 `행동 3회당 1회` 중 늦은 쪽).
  ⚠️ `Date.now()`는 이 레포 스크립트 규약과 무관하나, 클라 런타임에선 사용 가능 — store에 `lastSpontaneousAt` 추적.
- **직접 유발 발화는 제외**: 버튼 반응(T3·T4)·검색(T6)은 요청된 피드백이라 상한에 안 걸린다.
- **연속 같은 유형 금지**: 직전과 같은 trigger 종류면 스킵.
- **무음이 기본**: 결정적일 때만 자발 발화. 상한 초과 시 조용히 억제(발화 버림).

### 5. 틀림 인정 발화 (T4) — 상세

`buildJudgmentLine`의 `bad` 경로는 이미 "부스를 깎지 않고 예측이 빗나갔다"로 헤지한다. 여기에
**직전 interest가 must/curious였을 때만** 켜지는 명시적 "배움" 톤을 추가한다:

- 신규 i18n 키(ko·en): `companion.reactBadMissed` 예) "내가 이거 좋아할 줄 알았는데 아니었네. 하나 배웠다."
  / "Thought you'd love this one — guess I learned something."
- `judgment-bar`가 판단 직전 record에서 넘기는 `matchedPriorInterest`를 bad에도 전달(현재 good에만 씀).
- **그리고 실제로 다음 피드에서 그 결이 줄어드는 게 이미 `distill`에 반영됨** — 발화는 그 사실을 말로
  연결할 뿐, 빈말이 아니다.

### 6. i18n

신규 키는 `dictionaries.ts` **ko·en 양쪽**. 최소: T1(`copresenceSimilar`), T2(`copresenceCue`),
T5(`copresenceUnvisitedMust`), T4(`reactBadMissed`), T6(`copresenceSearchHit`). 파라미터: `{booth}`,
`{theme}`(카테고리 라벨), `{cue}`.

### 7. 수용 기준

- 지도에서 부스를 탭하면, 그 부스가 내 과거 긍정 반응과 가치가 겹칠 때 로미가 맥락 한 줄을 토스트로 띄운다.
- 임박 이벤트가 있는 관심 부스 근처에서 후회방지 한 줄이 뜬다(실제 cue 있을 때만).
- `interest=must`였는데 안 간 부스가 있으면 마치기 전에 로미가 짚는다.
- `verdict=bad`(직전 must/curious)에서 로미가 "예측 빗나감 + 배움"을 말한다.
- 자발 발화가 쿨다운/연속금지를 지켜 잔소리가 되지 않는다 — **상한 초과 시 발화가 억제되는 유닛 테스트** 포함.
- 재료가 없는 상황에선 `null`(침묵) — 억지 발화 없음.
- 전부 결정론, LLM 호출 0.

### 8. Out of scope (별도 문서/작업)

- **실시간 dwell 계측**(T7) — 클라 위치/체류 추적 신규 인프라.
- **온디맨드 grounded 자유 대화** — 개선 브리프 R4(명시적 액션 뒤 `generateGrounded`).
- **창발 크라우드 밀도** — 개선 브리프 TASK 3-B.
- 이 세 개는 co-presence를 더 깊게 하지만, 본 문서는 **저작 0·신규 인프라 0**으로 가능한 범위만 다룬다.

### 9. 검증 & 관례

```
npx tsc --noEmit
npx vitest run          # copresence.ts 순수 로직 + 상한 게이트 유닛 테스트 필수
npx eslint <changed paths>
```
- i18n ko·en 양쪽 확인. `/why`로 변경 이유 기록.
- 새 순수 함수(`copresence.ts`)는 반드시 테스트 동반(트리거별 발화/침묵, 상한).

---

## 한 줄 요약

발화 채널은 이미 있다(`say`/`flash`/toast). **트리거를 늘리고, 한 줄이 기억+사실+후회방지를 겸하게 하고,
잔소리 안 되게 상한을 걸고, 틀림을 인정하게 한다.** 저작 데이터 없이, 새 인프라 없이, 현장에서 로미가
"나랑 같이 보는 친구"가 되는 최소 스펙.
