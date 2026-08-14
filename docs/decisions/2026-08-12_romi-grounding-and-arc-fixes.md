# Roam · 로미 개선 구현 브리프 (Claude Code용)

> 이 문서는 다른 대화에서 코드 전체를 정독한 결과를 바탕으로 작성된 **실행 지시서**다.
> 파일 경로·현재 코드·바꿀 방향·수용 기준·검증까지 포함한다. 순서대로 진행하되,
> P0 세 개를 먼저 끝내고 커밋한 뒤 P1 로드맵은 "설계 먼저" 원칙으로 다룬다.

---

## 0. 절대 규칙 (작업 전 반드시 확인)

- **speed rule**: 탭·피드·컴패니언 발화의 **핫패스엔 LLM 금지**. 결정론 템플릿 즉답.
  LLM은 회고 내레이션(`narrateVisit`)·부스요약·커뮤니티요약·키워드 4곳뿐. `thinkingBudget=0` 유지.
- **가치 이름을 로미 발화에 쓰지 않는다.** "발견 쪽 부스야" 금지. 부스가 *실제로 뭘 하는 곳인지*
  (일러스트/출판/굿즈 = 분야 라벨)는 허용 — 이건 온보딩 단어 되읽기가 아니라 현장 정보다.
- **빈말 금지 원칙은 유지하되, "침묵"이 아니라 "가진 사실로 최소한 말하기"로 바꾼다** (TASK 2 핵심).
- **i18n는 항상 ko·en 양쪽** 수정 (`src/lib/i18n/dictionaries.ts`).
- **데드코드 건드리지 말 것**: `ai/booth-recommender.ts`, `onboarding/onboarding-*.ts`,
  `stores/onboarding.ts`, `components/feed/grounding-card.tsx`(피드는 인라인 렌더). 참조 0 확인됨.
- 변경 후 **검증**: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <changed paths>`.
- 커밋/PR은 `/why`로 이유 기록.

관련 설계 문서(읽고 정렬): `docs/decisions/2026-07-07_companion-reframe.md`(§5-B 3막·근거카드),
`.../2026-07-07_knowledge-architecture.md`(L1~L4), `.../2026-08-10_judgment-vocabulary.md`(interest×verdict),
`docs/ai-companion-ux-writing-patterns.md`(톤).

---

## 1. 큰 그림 — 왜 이 작업들인가

로미가 "진짜 사람처럼 이해·판단·기억"하려면 결국 세 개가 필요하다: **(a) 더 많은 enrichment,
(b) 잘 준비된 내부 시스템(메모리·스코어링), (c) 사람처럼 판단하는 RAG + 카피라이팅.** 지금은 셋 다
빈약하다. 그런데 (a)는 브랜드 허락이 필요해 미리 못 채우고, RAG는 speed rule 때문에 핫패스에
못 넣는다.

**해법의 뼈대 = "무거운 사고는 오프라인, 핫패스는 캐시된 결과":**

- **오프라인 RAG** (`generateGrounded` = googleSearch+urlContext, 이미 `src/lib/ai/gemini.ts`에 있음)이
  enrichment 저작 필드를 *초안 생성* → 사람 1클릭 승인. house-archive 스크립트가 이미 이 방향. → (a)+(c) 백필.
- **오프라인 메모리 증류**가 세션 사이에 L4 사용자 모델을 정제(결정론 + 필요 시 LLM reflection 한 겹). → (b).
- **핫패스는 템플릿**이되, 위에서 채워진 풍부한 필드 + 사용자의 실시간 궤적으로 조립. 사용자가 실제로
  "왜 이거?" 누른 ~5개 부스만 **온디맨드 grounding**으로 실시간 보강.

이번 P0 세 개는 그 토대 위에서 **"데이터가 없어도 로미가 침묵하거나 철학을 배신하지 않게"** 만드는
최소 수정이다. P1 로드맵이 (a)(b)(c)를 실제로 키운다.

---

## 2. P0 — 즉시 구현 (세 개)

### TASK 1 — "오늘 관람 마치기"를 열심히 본 사용자에게서 되살리기 (peak-end 배신 수정)

**파일**: `src/app/(visitor)/exhibitions/[slug]/page.tsx`

**현재 (line 243)**:
```tsx
{feedItems.length > 0 && <FinishVisit slug={slug} />}
```
`feedItems`(line 69)는 `curateFeed` 결과이고, `curateFeed`는 반응(interest/verdict)한 부스를
**전부 큐에서 제외**(`curate.ts:186` `eligible = rank.ranked.filter(s => !decided.has(s.booth.id))`).
→ 피드를 성실히 다 소진하면 `feedItems === []` → 마치기 버튼이 사라진다. **가장 몰입한 사용자가 3막
회고(=L3→L4 메모리 쓰기 + peak-end 페이오프)에 도달 못 하는** 철학 배신.

**변경**: 버튼 노출을 "추천이 남았나"가 아니라 "이번 전시에서 판단을 남겼나"에 묶는다.
이 페이지는 이미 `taste`를 로드한다(line 81, `getTasteAccuracy` → `{ judgedCount, pct }`).
그걸 그대로 쓰면 추가 쿼리 없이 해결된다:
```tsx
{user && taste.judgedCount > 0 && <FinishVisit slug={slug} />}
```

**추가(권장, 능동적 회고)**: `InterestFeed`가 큐 소진(visible 0) 상태에 이르면, 지금의
"지도에서 직접 돌아다녀 봐" 빈 상태 문구를 **회고 제안**으로 확장한다 —
예: "여기 있는 부스는 다 봤어. 오늘 이만하면 충분한 것 같은데, 정리해줄까?" + 마치기 CTA.
(분모 프레이밍: "충분히 즐겼다"를 도착시키는 순간.) 문구는 i18n ko·en 양쪽.

**수용 기준**:
- 로그인 사용자가 부스 1개라도 반응하면, 피드가 비어도 마치기 버튼이 보인다.
- 반응 0인 사용자에겐 안 보인다(마칠 게 없음).
- 비로그인은 종전대로 안 보인다.

---

### TASK 2 — 로미의 침묵 제거: 구조 폴백(소스 B) + 관계형 근거 완화(소스 A)

**문제**: `grounding.ts`의 `why`(line 88) = `[fact, link].filter(Boolean).join(" ")`.
`fact` 사다리(line 63~76)는 저작/공식 데이터가 다 없으면 **`null`**로 끝난다. 그리고 `curate.ts`의
`becauseOf`(line ~168)는 `if (linkUsed || !hasFact(booth)) return undefined` — **fact 없으면
link도 차단**. 결과: enrichment 없는 부스(SIF 451개, SIBF 159개)는 `why=""`로 **로미가 완전 침묵**.
현재 실측: 저작 4종(valueTags/roamInterpretation/recommendationReasons/memoryHooks) SIBF 16/256(6%),
SIF 0/914, House 0. → 대다수 카드가 침묵.

**핵심 원칙**: "부스가 뭔지 말 못 하면 근거도 안 붙인다"는 판단은 옳다. 하지만 결론이 *침묵*이 아니라
**"저작 데이터 말고 공짜 구조 데이터로 최소한의 '무엇'을 만든다"**여야 한다.

**변경 2-A — `fact` 사다리에 구조 계단 추가 (`src/lib/feed/grounding.ts`)**
floorplan에 이미 있는 것: `booth.tags`(분야 slug), `booth.company`(부스명). 사다리 맨 아래에 추가:
```
1. roamInterpretation (저작)
2. recommendationReasons (저작, 가치 겹칠 때)
3. summary (공식)
4. goodsKeywords[0] → "여기 {goods} 있어"
5. [신규] 분야 라벨      → 예 "일러스트 창작자 부스" (분야 slug → 사람 라벨)
6. [신규] company 폴백    → 예 "‘{name}’ 부스"   (이름만, 항상 존재 → null 거의 소멸)
```
- 분야 라벨은 **가치 라벨(valueLabel)이 아니라 전시 카테고리 라벨**을 써야 한다(부스가 뭘 하는 곳인지).
  `buildGrounding`에 카테고리 라벨 리졸버를 주입하라: 시그니처에 옵션 파라미터
  `categoryLabelForBooth?: (booth: Booth) => string | undefined` 추가.
  `curateFeed` 호출부에서 전시 카테고리 정의(`detail.categories` / `categoryById`)로 booth의 1차 분야
  slug을 사람 라벨로 바꿔 넘긴다. 라벨 못 구하면 5번은 건너뛰고 6번(company)으로.
- i18n 키 추가(ko·en): `grounding.whatCategory: "{label} 부스야"` / `grounding.whatBooth: "‘{name}’ 부스야"`.
  (톤: `docs/ai-companion-ux-writing-patterns.md` — 단정 대신 관찰, 마케팅 문구 금지.)

**변경 2-B — 관계형 근거(link) 자물쇠 완화 (`src/lib/feed/curate.ts`)**
이제 `what`이 항상 존재하므로 `!hasFact(booth)` 차단이 불필요하다.
- `becauseOf`에서 `hasFact` 게이트 제거(또는 신규 구조 폴백까지 포함하도록 `hasFact` 정의 확장).
- `linkUsed` 1회 제한을 **최대 2~3회로 상향**하되 **매번 다른 과거 반응 부스를 인용**(중복 금지):
  이미 인용한 부스 id를 `Set`으로 추적해 `positives.find(...)`에서 제외. 반복 문구 방지가 원래 취지이니,
  "서로 다른 근거로 서로 다른 카드"면 OK.
- **불변 규칙 유지**: 근거는 반드시 사용자가 실제로 긍정 반응(must/curious/good)한 부스와 **가치가 겹칠 때만**.
  겹치는 게 없으면 link 없음(억지 근거 금지). `verdict='bad'`는 절대 긍정 근거로 쓰지 않음(기존 로직 유지).

**테스트 업데이트**: `src/lib/feed/grounding.test.ts`, `src/lib/feed/curate.test.ts` —
① enrichment 전무 부스에서 `why`가 더 이상 빈 문자열이 아니라 분야/부스명 기반 문장이 나오는 케이스 추가,
② link가 fact 없는 카드에도 붙을 수 있고, 한 피드에서 서로 다른 부스를 인용하며 최대 N회로 제한되는 케이스,
③ 가치 안 겹치면 link 없음(빈말 금지) 케이스 유지.

**수용 기준**:
- enrichment가 하나도 없는 부스 카드도 로미가 **최소 "이게 뭔지(분야/부스명)"는 말한다.** 침묵 카드 0.
- 개인화 근거("아까 ○○에 끌려서…")가 한 피드에서 최대 2~3장, 서로 다른 부스 인용.
- 가치 이름은 어디에도 노출되지 않는다.

---

### TASK 3 — 가짜 크라우드 약속 제거 + (선택) 창발 밀도 프록시

**문제**: 컴패니언 답변 `companion.a2`가 "부스마다 붐빔 정도를 큐로 붙여놨어"라고 말하지만,
크라우드 소스는 동선 제품 제거로 **빈 스텁**(`src/lib/engine/service.ts` ~line 43, `heat.booths` 비어
`crowdByBooth` 전부 0; 지도 토글은 "densityBuilding" 토스트). 사용자가 그 말 믿고 찾으면 아무것도 없다.
톤 규칙 위반("Overclaim real-time crowd status 금지").

**3-A (필수, 즉시)**: `a2` 카피를 **정직하게** 바꾼다. ko·en 양쪽 (`dictionaries.ts` line 642 / 1306).
크라우드 티어를 약속하지 말고, 실제로 있는 것(이벤트·타이밍 큐 `deriveCue`, 이른/늦은 시간대 일반 조언)만.
예(ko): `"실시간 혼잡도는 아직 안 붙였어. 대신 이벤트·타이밍이 있는 부스는 큐로 표시해뒀고, 붐비는 건
보통 점심~오후라 이른/늦은 시간이 여유로워."` 트러스트 문구 규칙(`ux-writing` §Trust): "확인되지 않았어"를
숨기지 말 것.

**3-B (선택, 설계 후 구현)**: 진짜 혼잡을 저작 없이 만드는 **창발 밀도 프록시**. 다른 사용자들의
반응(booth_note interest/verdict) 집계를 부스별로 정규화해 `crowdByBooth`의 빈 자리를 채운다 —
"오늘 이 부스에 관심이 몰렸어" 수준의 *상대적* 신호. 저작은 안 늘지만 **사용량이 늘수록 자라는 네트워크
자산**이고, 수동 enrichment 확장성 문제를 우회한다.
- 소스: `booth_note` 집계(전시별, 최근 N시간 가중). repository에 집계 리드 추가.
- 톤: "실시간 위치 혼잡"이 아니라 "관심 몰림"으로 정직하게 라벨(추정임을 명시).
- 이게 들어가면 `a2`를 다시 이 신호 기준으로 업데이트.
- **speed rule 준수**: 집계는 요청 캐시/주기 계산, 핫패스에서 LLM 금지.

**수용 기준**:
- (3-A) 로미가 존재하지 않는 크라우드 데이터를 약속하지 않는다. 있는 것만 말한다.
- (3-B, 구현 시) `crowdByBooth`가 실제 반응 집계로 채워지고, 문구가 "추정/관심 몰림"으로 정직하다.

---

## 3. P1 — 토대 로드맵 (설계 먼저, 큰 작업 — 바로 코딩하지 말고 결정 문서부터)

각 항목은 `docs/decisions/`에 `YYYY-MM-DD_*.md`로 설계를 먼저 남긴 뒤 착수한다.

### R1 — enrichment 저작 백필 파이프라인 (RAG, 확장성의 핵심)
- 목적: 브랜드 사전 허락 없이도 저작 필드(roamInterpretation·recommendationReasons·thingsToDo·
  memoryHooks)를 **초안**으로 채워, 사람이 승인만 하게.
- 입력: 공식 디렉터리 CSV + 부스 공개 웹/인스타. 도구: `generateGrounded`(이미 있음).
- 출력: enrichment JSON 초안 + `booth_enrichment` UPSERT 마이그레이션. **저작 필드는 재생성 시 보존**
  (house-archive 스크립트 규약 그대로).
- 우선순위: **SIF(914부스, 현재 저작 0%)** 가장 시급, 다음 SIBF 저작 6%→확대.
- speed rule 준수: 전부 오프라인 배치.

### R2 — 메모리 증류 reflection 레이어 (L4 강화, "기억")
- 목적: 세션 사이에 raw 신호 원장(`user_signal_log`)을 재정독해 L4 사용자 모델(`user_brain`)을
  더 풍부하게 — 클릭으로 안 드러나는 취향 축까지. 결정론 증류 + 필요 시 LLM reflection **한 겹**(오프라인).
- 규칙: 저장(축적) 아니라 증류(정제→압축→승격→아카이브→재증류). 브레인은 항상 프롬프트에 주입되는 신원.
- 수용: 재방문 시 로미가 지난 관람을 구체적으로 참조(문서 §회고=메모리 쓰기).

### R3 — 카피라이팅 변주 엔진 ("사람처럼")
- 목적: 반응/근거 발화가 반복 문구로 느껴지지 않게. `docs/ai-companion-ux-writing-patterns.md`의
  기본 패턴("너는 [성향]이니까 지금은 [행동], 이유는 [근거], 원하면 [수정]")을 결정론 조립기로.
- 규칙: 최근 사용 템플릿 추적해 반복 회피 · 항상 **구체 참조**(실제 부스명·실제 과거 반응) · 불확실성 인정.
- ⚠️ writing-guide는 2026-07-11자라 구 어휘(끌림/나중에/별로/이미봄)를 씀 — 신 어휘
  interest(꼭 갈래·끌려·패스)×verdict(좋았어·그냥·아니)로 매핑해 갱신.

### R4 — 온디맨드 grounding ("왜 이거?"의 순간에만)
- 목적: 전 부스 사전 저작 대신, 사용자가 실제로 근거를 물은 그 부스만 실시간 grounding.
- 트리거: 부스 상세/컴패니언 "왜 이걸 추천했어?"(현재 캔 답변 a3) → `generateGrounded` 1회 호출 →
  결과 캐시(다음부턴 저작 필드처럼 재사용). 로딩 UX + 라이팅(`loading-messages.ts`) 필수.
- speed rule 준수: 피드 렌더 아님, 명시적 사용자 액션 뒤에서만. 실패 시 결정론 폴백.

---

## 4. 검증 & 관례 (매 태스크 종료 시)

```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- i18n는 ko·en 양쪽 채웠는지 확인.
- `/why`로 각 변경 이유 기록(메모리 규칙).
- CLAUDE.md의 stale 수치(House 68/104, 저작 "2부스")는 실측(House 99/104, 저작 16부스)과 다름 —
  만지는 김에 갱신하면 좋음(선택).

**진행 순서 제안**: TASK 1 → TASK 2 → TASK 3-A 까지 한 배치로 구현·검증·커밋.
그 다음 3-B와 P1(R1~R4)은 각각 결정 문서부터.
