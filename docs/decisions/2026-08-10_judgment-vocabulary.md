# 판단 어휘 재설계 — 관심(피드)과 판정(현장)을 가른다

> 상태: 설계 확정, 미구현. 2026-08-10.
> 대상: 부스 반응 체계 전반 — 타입·DB·신호 가중치·채점·UI·로미 발화·회고.

## 1. 문제

지금 부스 반응은 **끌림 / 나중에 / 별로 / 이미 봄** 4칸 한 세트다(`components/feed/reaction-bar.tsx`).
이 한 세트를 피드·지도·부스 상세가 공유한다. 세 가지가 깨져 있다.

### 1-1. 서로 다른 두 질문이 한 줄에 섞여 있다

- **피드**는 관람 **전**이다. 사진과 소개만 보고 "얼마나 끌리나"를 묻는 자리다 — 정도의 문제.
- **지도**는 관람 **중·후**다. 실제로 가보고 "맞았나 아니었나"를 확인하는 자리다 — 검증의 문제.

그런데 버튼이 하나라서, 안 가본 부스에 "별로"를 눌러야 하고("별로"라는 어감이 센 것도
여기서 온다 — 가보지도 않고 부스를 깎는 말이 된다), 다녀온 부스에 "끌림"을 눌러야 한다.

### 1-2. "이미 봄"이 취향을 오염시킨다

"이미 봄" → `status='visited'` → `booth_visited` 신호 → **implicit 1.0 긍정**
(`constants.ts:156`). 하지만 "이미 봄"은 취향 정보가 아니라 **큐 관리 행위**다("이거
안 보여줘도 돼"). 좋아서 봤는지 지나쳤는지 구분이 없는데, 끌림(1.2) 바로 아래 무게로
브레인에 쌓인다.

파생 버그: `curate.ts`의 근거 링크가 `status === 'interested' || 'visited'`를 긍정으로
읽는다. 별로였던 부스가 "너 여기 좋아했잖아"의 근거가 될 수 있다.

### 1-3. 예측과 결과가 짝지어지지 않는다

한 부스는 한 상태만 가진다. "끌린다고 찍어둔 곳에 가봤더니 아니었다"가 데이터 구조상
표현 불가능하다. 그래서 취향 정확도 %(`taste.ts`)가 실질적으로 "사용자가 눌렀나"만
세고 있다 — **로미가 자기 추천이 틀렸다는 걸 배울 방법이 없다.**

### 1-4. 화면마다 어휘가 다르다

| 화면 | 현재 |
|---|---|
| 피드 `reaction-bar.tsx` | 4칸 (끌림·나중에·별로·이미 봄) |
| 지도 시트 | 4칸 + "여기 어땠어?" 되묻기 |
| 부스 상세 `booth-personal-panel.tsx` | **2칸** (visited·skipped) |

## 2. 이미 지어져 있는 것 (재사용 자산)

이 설계는 새 개념 발명이 아니다. 현장 판정 기계는 절반 이상 이미 있다.

- `BoothNote.retro`: `"liked" | "disliked"` — '가봄' 부스의 뒤늦은 호불호 답
- `POST /api/me/notes/[boothId]/retro` — 지도 시트 "여기 어땠어?" · 관람 마치기 일괄 되묻기
- `judgedClass` 얼리기(`memory/taste.ts` `classifyBooth`) — 판정 순간의 브레인 상태를 고정
- `judgmentScore` → `computeTasteAccuracy` → 취향 정확도 %
- `SIGNAL_BY_STATUS` 단일 신호 적재 지점(`api/me/notes/[boothId]/route.ts`)

**`retro`를 1급 시민으로 승격하고 3단으로 넓히는 것**이 이번 작업의 뼈대다.

## 3. 결정한 어휘

```
관람 전 (피드)     꼭 갈래 · 끌려 · 패스          + 무반응 = 보류
현장 (지도·상세)   좋았어 · 그냥그랬어 · 아니었어
```

### 3-1. 왜 3칸인가

피드는 6칸짜리 결정 큐고, 반응한 부스만 큐에서 빠진다(`feed/rhythm.ts`). 즉
**안 누르는 것이 이미 "보류"**다. 중립 칸을 버튼으로 세울 이유가 없다.

4칸 안(`꼭 / 끌림 / 나중에 / 패스`)은 검토 후 버렸다 — "나중에"는 **시간** 개념인데
**정도** 자에 섞여 있고, "꼭/끌림"은 같은 방향의 강도 차이라 경계가 사람마다 흔들린다.
"나중에"의 시간 의미는 북마크(`booth_bookmarked`)가 이미 맡고 있다.

### 3-2. 왜 "패스"인가

"별로"는 부스를 **평가**하는 말이다. 안 가본 부스에 쓰면 과하다. "패스"는 내 큐를
**정리**하는 말이라 같은 negative 신호를 담으면서 어감 문제가 없다.

### 3-3. 현장 판정이 곧 방문 기록

소감을 남기면 그게 방문 기록이다(1탭). 별도 "가봄" 토글을 두지 않는다 — 현장은 손이
바쁜 곳이라 2탭을 요구하면 안 누른다.

"갔는데 안 누른 것"과 "꼭 갈래인데 못 간 것"은 **회고에서 묻는다**(§7). 부스를 일일이
다 누르는 건 현실적으로 불가능하므로 완결성을 요구하지 않는다. 무반응은 **약한 근거**로만
쓰고 단정하지 않는다.

## 4. 데이터 모델

### 4-1. 한 필드가 아니라 두 필드

`interest`와 `verdict`는 **직교**한다. "꼭 갈래로 찍어둔 곳에 다녀와서 좋았어"가
동시에 참이어야 하고, 그 조합이 §1-3의 학습 능력을 만든다.

```
interest  : 'must' | 'curious' | 'pass' | null    화면에서 한 판단
verdict   : 'good' | 'ok' | 'bad' | null          현장에서 한 판단
visitedAt : timestamp | null                       verdict 있으면 항상 참
```

`status`(4값) + `retro`(2값)를 이 셋으로 접는다.

### 4-2. 지도 색 결정

```
색 = verdict ?? interest ?? 존 색
```

결과가 예측을 덮는다.

### 4-3. 마이그레이션 (`booth_note`)

| 기존 | 새로 |
|---|---|
| `status='interested'` | `interest='curious'` |
| `status='later'` | `interest='curious'` |
| `status='skipped'` | `interest='pass'` |
| `status='visited'` + `retro='liked'` | `verdict='good'`, `visitedAt=updated_at` |
| `status='visited'` + `retro='disliked'` | `verdict='bad'`, `visitedAt=updated_at` |
| `status='visited'` + retro 없음 | `verdict=null`, `visitedAt=updated_at` → 회고 되묻기 큐 |

마지막 줄이 핵심 — **없는 판정을 지어내지 않는다.** 다녀온 건 사실이니 `visitedAt`은
남기고 만족도는 비운 채 로미가 되묻는다.

`later → curious` 흡수 근거: 신호상 약한 긍정이라 `curious`와 같은 자리다. 시간 의미는
북마크가 맡는다. 데이터를 버리지 않고 접는다.

### 4-4. 폐기

- `BoothNote.status`, `BoothNote.retro` (컬럼)
- `BoothStatus` 타입(`stores/visit.ts`)
- `SignalKind`의 `reaction_interested` · `reaction_later` · `booth_visited` · `booth_skipped`
- `components/feed/reaction-bar.tsx`
- `api/me/notes/[boothId]/route.ts`의 `needsJudgment`(모든 반응이 판정 대상이 되므로 불필요)

## 5. 신호 가중치

**원칙: 경험한 판정이 화면상의 판단을 이긴다.** 현재는 반대다 —
`reaction_interested`(카드만 보고 누름) 1.2 > `booth_visited`(실제 다녀옴) 1.0.

### 5-1. 새 `SIGNAL_WEIGHTS` (`constants.ts`)

| 신호 | explicit | implicit | negative | 근거 |
|---|---|---|---|---|
| `reaction_must` | 1.2 | 0 | 0 | 가겠다고 정한 것 = 가장 강한 명시 의사 |
| `reaction_curious` | 0.6 | 0 | 0 | 좋은데 확정 아님. must의 절반 |
| `reaction_pass` | 0 | 0 | 0.5 | 카드만 보고 내린 거절 — 근거가 얕아 약하게 |
| `verdict_good` | 1.5 | 0 | 0 | 몸으로 확인한 긍정. 전체 최고 |
| `verdict_ok` | 0 | 0.3 | 0 | 갔다는 사실만 약한 암묵 신호 |
| `verdict_bad` | 0 | 0 | 1.2 | 가보고 아니었다 = 가장 확실한 부정 |

유지: `booth_bookmarked` 1.2 · `feed_click` 0.3 · `search_query` 1.3

두 개의 의도적 뒤집기:
- `verdict_good`(1.5) > `reaction_must`(1.2)
- `verdict_bad`(1.2) > `reaction_pass`(0.5)

## 6. 채점 (`memory/taste.ts`)

`judgmentScore`가 **verdict 우선**으로 읽는다. verdict가 있으면 interest는 무시 —
결과가 예측을 이긴다.

```
verdict='good'  →  +1
verdict='ok'    →   0                       중립. 맞지도 틀리지도 않음
verdict='bad'   →  confident면 -1, 아니면 0

verdict 없음:
  interest='must'    →  +1
  interest='curious' →  +0.6                기존 later 0.3 ↑ / interested 1.0 ↓
  interest='pass'    →  confident면 -1, 아니면 0
  없음               →  null (채점 제외)
```

`confident`(브레인 confidence ≥0.25 가치와 겹침) 조건은 기존 규칙 그대로 —
**자신 있다고 한 것만 틀렸을 때 깎인다.** 낯선 부스 탐색에 벌점을 주지 않는다.

`judgedClass`를 얼리는 시점이 둘로 늘어난다: interest 최초 기록 시, verdict 기록 시.
verdict 쪽이 나중이자 최종이다. 메모만 고치는 쓰기에서 재계산되면 안 된다는 기존 원칙
(`statusChanged` 가드)은 두 필드 각각에 대해 유지한다.

**이번 설계가 실제로 얻는 것**: `interest='must'` + `verdict='bad'` = 로미 추천이
빗나간 사례. 지금은 이 조합이 데이터에 존재할 수 없다.

## 7. 회고 (`/api/me/reflect`)

기존 일괄 되묻기를 확장해 두 묶음을 묻는다.

1. `visitedAt` 있는데 `verdict` 없음 → "어땠어?" + verdict 3칸
   (레거시 행 + 현장에서 안 누른 것)
2. `interest='must'`인데 `visitedAt` 없음 → "여기 가봤어?"
   → 예 → verdict 3칸 / 아니오 → 조용히 넘김

2번은 **단정하지 않고 묻는다.** 안 답하면 채점에서 빠질 뿐 "못 갔다"로 기록하지 않는다.

## 8. UI

### 8-1. 공통 컴포넌트

```
components/booth/judgment-bar.tsx          신규
  mode="interest"   꼭 갈래 / 끌려 / 패스
  mode="verdict"    좋았어 / 그냥 / 아니었어
  mode="both"       interest 3칸 + "여기 다녀왔어" 링크
```

| 화면 | mode | 이유 |
|---|---|---|
| 피드 | `interest` | 관람 전. 정도만 묻는다 |
| 지도 시트 | `adaptive` | 현장. 관심 여부로 분기 — 아래 개정 참조 |
| 부스 상세 | `adaptive` | 지도와 같은 규칙 |

> **개정 2026-08-11** — 지도·상세를 `both` 고정에서 **관심 여부에 따른 분기**로 바꿨다.
> 전문은 `docs/decisions/2026-08-11_taste-radar-map-sheet-zoom.md` §3-3.
>
> | 부스 상태 | 3칸 | 링크 |
> |---|---|---|
> | `interest` 없음 · `verdict` 없음 | 꼭 갈래 · 끌려 · 패스 | `여기 다녀왔어 →` |
> | `interest` 있음 · `verdict` 없음 | 좋았어 · 그냥그랬어 · 아니었어 | `관심 바꾸기 →` |
> | `verdict` 있음 | 판정 3칸(선택 표시) | `관심 바꾸기 →` |
>
> §8-2가 검토 후 버린 "상태 자동 분기"는 **다녀왔는지를 알 방법이 없어서** 버린
> 것이었다. 관심을 눌렀는지는 확실히 아는 값이라 같은 문제가 없다.

### 8-2. 지도 시트 배치 (확정안 P2)

기본은 interest 3칸 + 그 아래 `여기 다녀왔어 →` 텍스트 링크. 링크를 누르면 verdict
3칸으로 **교체**되고, 위에 이전 상태가 한 줄로 남는다(`● 꼭 갈래로 찍어둔 곳 · 다녀옴`).

근거: 시트가 짧아 지도를 덜 가리고, 화면에 뜬 버튼이 전부 지금 누를 만한 것이며,
"찍어둠 → 다녀옴 → 판정"의 시간 순서가 UI에 그대로 보인다.

되돌리기 규칙:
- `verdict`가 이미 있는 부스는 시트를 열면 **바로 verdict 화면**으로 뜬다(링크 단계 생략).
  그 위 상태 줄에 `관심 바꾸기` 링크를 둬 interest 화면으로 되돌아갈 수 있다.
- 선택한 버튼을 다시 누르면 해제된다(기존 `toggleStatus` 동작 유지). `verdict`를 해제하면
  `visitedAt`도 같이 지운다 — 판정이 곧 방문 기록이므로 둘은 분리해 남기지 않는다.
- `interest`와 `verdict`는 서로를 지우지 않는다. `interest='pass'` + `verdict='good'`
  (넘겼는데 우연히 들렀고 좋았음) 같은 조합도 정상이며, 채점은 verdict를 따른다(§6).

검토 후 버린 안:
- 6칸 항상 노출 — 시트가 길고 절반이 안 쓸 버튼
- 상태 자동 분기 — "다녀왔다"를 시스템이 알 방법이 없다. 앱에 실내 위치 추적이 없고
  도면은 SVG 좌표계다. 사용자가 직접 말할 방법도 사라진다

### 8-3. 피드에는 "다녀왔어" 링크를 두지 않는다

의도한 플로우가 **피드 = 관람 전 / 지도 = 현장**이기 때문이다. 피드를 안 끝내고 온
사용자는 지도에서 interest까지 매기고, 로미는 거기서 취향을 배운다.
지도에서 판정한 부스는 `curate.ts`가 자동으로 큐에서 빼므로 피드에 다시 안 나온다.

## 9. 지도 색

라이트 모드 — 확정안 L1(6색 전부 면, 빨강만 채도 하향).

| 상태 | 값 | 비고 |
|---|---|---|
| 꼭 갈래 | `#4f46e5` | `--primary` 재사용 |
| 끌려 | `#8b88ee` | 신규 |
| 좋았어 | `#15c47e` | `--route-visited` 재사용 |
| 그냥그랬어 | `#7edcb4` | 신규 |
| 아니었어 | `#d0595d` | 신규 (`#e5484d`에서 채도 하향) |
| 패스 | `#aab2bf` | 신규 |
| 무반응 | 존 색 | 기존 |

다크 모드 — 기존 토큰의 다크 판본을 따르고, 신규 4색은 같은 방식(컬러는 명도↑,
무채는 배경에 맞춰 명도↓)으로 잡는다. 구현 시 실제 대비 확인 필요.

| 상태 | 다크 |
|---|---|
| 꼭 갈래 | `#818cf8` (`--primary` 다크) |
| 끌려 | `#a5a2f0` |
| 좋았어 | `#2ad48f` (`--route-visited` 다크) |
| 그냥그랬어 | `#5cbf95` |
| 아니었어 | `#e07478` |
| 패스 | `#6b7280` |

토큰명 `--judge-must` / `-curious` / `-good` / `-ok` / `-bad` / `-pass`.

**"그냥그랬어"는 초록 계열에 둔다**(무채로 빼지 않는다). 다녀온 건 다녀온 것이고,
지도에서 "다녀온 구역"이 한 덩어리로 읽혀야 진행 상황이 보인다. 무채로 빼면 '패스'와
같은 무리로 묶여 방문 사실이 색에서 사라진다.

설계 원칙 (검토 과정에서 확정):
- **전부 면(fill)**. 테두리·뱃지로 상태를 나르지 않는다 — 부스 핀이 작아 안 읽힌다
- **약한 긍정을 흐리게 칠하지 않는다.** "끌려"를 연한 색으로 두면 무반응과 구분이 안 된다.
  사용자가 누른 상태는 안 누른 상태보다 **명백히 진해야** 한다
- **빨강은 채도를 낮춰 쓴다.** 경고가 아니라 기록으로 읽혀야 한다

참조가 끊기면 `--warning`(구 '나중에' 노랑)·`--booth-skipped`(구 '별로' 분홍) 제거.

## 10. 로미 발화 (`companion/reaction-line.ts`)

`ReactionKey`가 6종으로 확장된다. 브레인 confidence ≥0.25면 분야를 언급하고 아니면
담백하게 가는 기존 매칭 로직은 그대로 재사용한다.

verdict 3종의 새 규칙:

- `good` — 예측이 맞았을 때(직전 `interest`가 `must`/`curious`) "찍어둔 데가 맞았네" 쪽,
  없었으면 "여긴 몰랐는데 좋았구나" 쪽
- `ok` — 헤지. 판단을 강요하지 않는다
- `bad` — **가장 조심할 자리.** 부스를 깎지 않고 *내 예측이 빗나갔음*을 로미가 가져간다.
  기존 skip 헤지 원칙(부스 하나를 분야 전체 부정으로 말하지 않기)을 그대로 적용

가치 이름을 발화에 쓰지 않는 원칙 유지
(`docs/decisions/2026-07-13_romi-ux-writing.md`, CLAUDE.md 근거 카드 절).

i18n 키: `reaction.{must|curious|pass|good|ok|bad}` (버튼) +
`companion.react{Must|Curious|Pass|Good|Ok|Bad}` 계열(발화, 각 최소 3변주 · `Plain` 판본 포함).

## 11. 피드 큐 (`feed/curate.ts`)

- 제외 조건: `interest != null || verdict != null` (기존 `status != null`과 동치)
- 근거 링크용 `positives`: `interest='must'|'curious'` 또는 `verdict='good'`
- **`verdict='bad'`는 근거로 절대 쓰지 않는다** — §1-2의 버그 수정

## 12. 영향 파일

| 파일 | 변경 |
|---|---|
| `lib/types/index.ts` | `BoothNote` 필드 교체, `SignalKind` 재정의 |
| `lib/constants.ts` | `SIGNAL_WEIGHTS` 재작성 |
| `lib/memory/taste.ts` | `judgmentScore` verdict 우선 |
| `lib/memory/service.ts` | `REFLECT_KINDS` 신호명 교체 |
| `lib/feed/curate.ts` | 제외 조건 · positives · bad 배제 |
| `lib/stores/visit.ts` | `BoothStatus` → `interest`/`verdict`, `pushRetro` 통합 |
| `lib/schemas/index.ts` | `boothNoteInputSchema` enum 교체 |
| `app/api/me/notes/[boothId]/route.ts` | `SIGNAL_BY_STATUS` 교체, `needsJudgment` 삭제 |
| `app/api/me/notes/[boothId]/retro/route.ts` | 흡수 후 삭제 |
| `app/api/me/reflect/*` | 두 묶음 되묻기 |
| `components/booth/judgment-bar.tsx` | 신규 |
| `components/feed/reaction-bar.tsx` | 삭제 |
| `components/feed/interest-feed.tsx` | `judgment-bar` mode=interest |
| `components/map/exhibition-map.tsx` | 색 규칙 `verdict ?? interest` |
| `components/booth/booth-personal-panel.tsx` | 2칸 → `judgment-bar` mode=both |
| `lib/companion/reaction-line.ts` | 6종 확장 |
| `app/globals.css` | `--judge-*` 토큰 추가, 구 토큰 정리 |
| `supabase/migrations/00NN_*.sql` | 컬럼 추가 + 데이터 이관 + 구 컬럼 제거 |
| repo(`mock`·`supabase`) | 노트 매핑 · `getTasteAccuracy` |

## 13. 테스트

- `taste.test.ts` — verdict 우선 채점, `must+bad` 조합, confident/uncertain 분기
- `curate` — `verdict='bad'` 부스가 근거로 안 쓰이는지
- 마이그레이션 — 6가지 기존 조합이 전부 의도대로 접히는지 (특히 `visited`+retro 없음)
- `reaction-line` — 6종 × 매칭 있음/없음 × 이름 있음/없음

## 14. 이 설계가 다루지 않는 것

- **북마크와 `interest='must'`의 관계.** 둘 다 "찜"에 가까운 의미라 장기적으로 겹친다.
  이번엔 건드리지 않는다 — 북마크는 별도 테이블·별도 화면이고, 지금 통합하면 범위가
  두 배가 된다. `later`를 `curious`로 흡수하는 것까지가 이번 경계다.
- **회고 화면 자체의 재설계.** §7은 되묻기 큐에 두 묶음을 넣는 것까지만 정한다.
  회고 UI·문구는 별도 작업.
- **부스 목록·검색 화면의 상태 표시.** 지도·피드·부스 상세 세 곳만 이번에 통일한다.
