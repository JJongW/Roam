# 온보딩 분기별 질문·답변 전체 정리

> 소스: `src/lib/onboarding/onboarding-flow.ts` · `onboarding-types.ts`
> 원칙: 폼 아님 = 대화. 한 번에 하나만 묻고, 직전 답에 따라 다음 질문·문구가 바뀐다.
> 사용자는 이미 특정 전시 안에 있음 → "전시 선택"은 안 묻고 **"부스 정했는지"로 분기**.

## 분기 갈림길

Step 1(`start`) 답이 전체 흐름을 가른다.

```
start ─┬─ has_booths ─→ booth_pick → booth_related → preference → visit_date → time → route_style → [요약·생성]
       └─ open ───────→ visit_date → intent(복수) → followup(의도마다 반복) → preference → time → route_style → [요약·생성]
```

- **has_booths**: intent·followup **건너뜀**. 취향(preference)을 먼저 묻고 방문시점을 뒤에.
- **open**: booth_pick·booth_related **건너뜀**. 방문시점을 먼저 묻고 의도 기반으로 진행.

---

## 공통 Step 1 — 부스 계획 (`start`)

- **메시지**: "안녕? 나는 안내 도우미 Roam이야. / 전시를 더 편하게 둘러볼 수 있도록 같이 도와줄게."
- **질문**: "혹시 이미 가보고 싶은 부스가 있어?"
- **답변** (단일):

| value | 라벨 | hint | 다음 |
|---|---|---|---|
| `has_booths` | 응, 정해둔 곳이 있어 | 바로 골라줄게 | → booth_pick |
| `open` | 아니, 추천받고 싶어 | 대화로 맞춰보자 | → visit_date |

---

## 분기 A — has_booths (부스 이미 정함)

### A-1. 부스 직접 선택 (`booth_pick`)
- **메시지**: "좋아. 어디부터 가고 싶은지 골라줘."
- **질문**: "가고 싶은 부스를 골라줘"
- **답변**: 정적 옵션 없음 — 실제 부스 데이터로 **검색+다중선택 picker**를 컴포넌트가 커스텀 렌더. 선택 id 배열 → `selectedBoothIds`.
- **다음**: → booth_related

### A-2. 관련 부스 여부 (`booth_related`)
- **메시지**: "좋아. {N}곳 담았어. / 네가 고른 곳을 중심으로 동선을 짜줄게." (N = 고른 부스 수)
- **질문**: "고른 곳 말고, 관련된 다른 부스도 같이 찾아줄까?"
- **답변** (단일):

| value | 라벨 | hint | 효과 |
|---|---|---|---|
| `want` | 응, 비슷한 곳도 보여줘 | 관심 갈 만한 곳을 더해줄게 | `wantRelatedBooths=true` (선택 고정 + 추천 병합) |
| `only` | 아니, 이 부스들만 갈래 | — | `wantRelatedBooths=false` (고른 부스만, LLM skip) |

- **다음**: → preference

### A-3. 평소 취향 (`preference`) — *공통, 아래 참조*
- has_booths에서는 preference **다음이 visit_date**.

### A-4. 방문 시점 (`visit_date`) — *공통, 아래 참조*
- has_booths에서는 visit_date **다음이 time** (intent/followup 건너뜀).

### A-5. 가용 시간 (`time`) → A-6. 안내 방식 (`route_style`) — *공통*

---

## 분기 B — open (추천받고 싶음)

### B-1. 방문 시점 (`visit_date`) — *공통*
- open에서는 visit_date **다음이 intent**.
- 답에 따라 다음 스텝(intent) 앞에 붙는 **AI 반응**(`visitDateReaction`):
  - `today` → "좋아. 그럼 지금 진행 중인 이벤트나 대기 상황도 같이 고려해볼게."
  - `this_week` / `specific_date` → "좋아. 그 날짜 기준으로 운영 정보와 이벤트를 함께 반영해볼게."
  - `undecided` → "괜찮아. 시간은 천천히 정해도 돼. 먼저 취향부터 맞춰보자."

### B-2. 관람 의도 (`intent`) — 복수 선택
- **메시지**: 위 visitDateReaction 문구.
- **질문**: "이번 전시가 끝났을 때 어떤 기분이면 만족스러울 것 같아?"  ·  hint: "여러 개 골라도 돼"
- **답변** (다중):

| value | 라벨 |
|---|---|
| `discovery` | 새로운 걸 발견하고 싶어 |
| `purchase` | 좋은 제품을 사고 싶어 |
| `information` | 일이나 공부에 도움이 되는 정보를 얻고 싶어 |
| `experience` | 직접 체험해보고 싶어 |
| `casual` | 그냥 가볍게 둘러보고 싶어 |
| `unknown` | 아직 잘 모르겠어 |

- 규칙: 다른 의도와 함께 고르면 `unknown` 자동 제거. 대표 `intent` = 목록 첫 번째.
- **다음**: → followup

### B-3. 의도별 follow-up (`followup`) — 선택한 의도마다 1회씩 반복
- 고른 의도 순서대로 반복. 여러 개면 메시지 앞에 `(1/N)` 진행 표시.
- 각 의도별 메시지·질문·답변:

**discovery (새로운 발견)**
- 메시지: "좋아. 그럼 유명한 부스만 보기보다 숨은 부스도 같이 찾아볼게."
- 질문: "새로운 걸 좋아한다면, 직접 체험하는 부스도 괜찮아?"
- 답: `ok_experience` 좋아 / `prefer_view` 체험보다는 구경이 좋아 / `avoid_crowd` 사람 많은 곳은 피하고 싶어 → **혼잡 회피**

**purchase (구매)**
- 메시지: "좋아. 그러면 실제로 구매하거나 비교해볼 수 있는 부스를 우선해서 볼게."
- 질문: "가격 혜택이나 현장 이벤트도 중요해?"
- 답: `deal_important` 중요해 / `quality_first` 제품 퀄리티가 더 중요해 / `both` 둘 다 보고 싶어

**information (정보·공부)**
- 메시지: "좋아. 그러면 설명이 잘 되어 있거나 상담받기 좋은 부스를 우선해서 볼게."
- 질문: "깊게 상담받는 쪽이 좋아, 아니면 빠르게 여러 곳을 보는 쪽이 좋아?"
- 답: `deep` 깊게 상담받고 싶어 / `wide` 빠르게 여러 곳을 보고 싶어 / `mix` AI가 적당히 섞어줘

**experience (체험)**
- 메시지: "좋아. 그럼 직접 해볼 수 있는 부스를 조금 더 많이 넣어둘게."
- 질문: "대기 시간이 있어도 괜찮아?"
- 답: `ok_wait` 괜찮아 / `short_wait` 짧은 대기 위주로 보고 싶어 → **긴 대기 회피** / `low_crowd` 사람이 적은 곳이 좋아 → **혼잡 회피**

**casual (가벼운 관람)**
- 메시지: "좋아. 그럼 너무 빡빡한 코스보다는 가볍게 둘러볼 수 있는 길로 잡아볼게."
- 질문: "사진 찍기 좋은 곳이나 이벤트 부스도 포함할까?"
- 답: `ok_photo` 좋아 / `quiet` 조용한 곳이 좋아 → **혼잡 회피** / `popular` 인기 부스 위주로 보고 싶어

**unknown (탐색 중)**
- 메시지: "괜찮아. 그럼 몇 가지 느낌 중에서 조금 더 끌리는 걸 골라봐."
- 질문: "어떤 쪽이 더 끌려?"
- 답: `popular` 사람들이 많이 찾는 부스 / `hidden` 숨겨진 부스 / `photo` 사진 찍기 좋은 곳 / `experience` 체험이 많은 곳 / `fast` 빠르게 둘러볼 수 있는 곳

- **다음**: 아직 안 물은 의도 남으면 → followup 반복, 다 물었으면 → preference

### B-4. 평소 취향 (`preference`) — *공통*
- open에서는 preference **다음이 time**.

### B-5. 가용 시간 (`time`) → B-6. 안내 방식 (`route_style`) — *공통*

---

## 공통 스텝 상세

### 방문 시점 (`visit_date`)
- 메시지: "좋아. 그럼 일정부터 맞춰볼게."
- 질문: "언제 방문할 예정이야?"
- 답 (단일): `today` 오늘 / `this_week` 이번 주 / `specific_date` 날짜 선택(ISO 저장) / `undecided` 아직 정하지 않았어
- 다음: has_booths → time · open → intent

### 평소 취향 (`preference`) — 다중
- 메시지: "좋아. 이제 네 취향을 조금 더 알고 싶어."
- 질문: "평소에는 어떤 부스에서 오래 머무는 편이야?"
- 답: `experience` 직접 체험할 수 있는 곳 / `goods` 굿즈나 쇼핑 / `tech` 새로운 기술 / `design` 디자인이 좋은 공간 / `talk` 설명을 들을 수 있는 곳 / `event` 이벤트가 있는 곳 / `quiet` 사람이 적은 곳(→ **혼잡 회피**) / `unknown` 잘 모르겠어(제거됨)
- 다음: has_booths → visit_date · open → time

### 가용 시간 (`time`)
- 메시지: "좋아. 선택한 취향을 기준으로 추천 우선순위를 조정해둘게." (preferenceReaction)
- 질문: "얼마나 여유롭게 둘러볼 수 있어?"
- 답 (단일): `30m` 30분 정도 / `1h` 1시간 정도 / `2_3h` 2~3시간 / `flexible` 시간은 크게 상관없어 / `unknown` 아직 모르겠어
- 다음: → route_style

### 안내 방식 (`route_style`)
- 메시지: "거의 다 왔어. 나는 여러 방식으로 안내할 수 있어."
- 질문: "어떤 스타일이 좋을까?"
- 답 (단일): `ai_auto` AI에게 맡길게(네 답을 바탕으로 가장 잘 맞게) / `max_booths` 최대한 많이 보기 / `slow` 천천히 둘러보기 / `low_crowd` 사람이 적은 곳 위주 / `popular` 인기 부스 위주 / `hidden_mix` 숨은 부스 섞어보기
- 다음: null → **요약 + 동선 생성** (`POST /api/onboarding/route`)

---

## 부가 메모
- **혼잡 회피(`avoidances: "crowd"`)** 유발 답: `avoid_crowd`, `low_crowd`, `quiet`(followup·preference).
- **긴 대기 회피(`avoidances: "long_wait"`)** 유발 답: `short_wait`.
- follow-up 답은 스키마 안 늘리고 `dynamicAnswers.followup_{intent}` 키로 보관.
- "내가 이해한 내용" 패널(`buildUnderstanding`): 답한 항목만 순차 표시 — 방문상태·고른부스·관련부스·방문시점·목적·선호·피하고싶은것·시간·안내방식.
