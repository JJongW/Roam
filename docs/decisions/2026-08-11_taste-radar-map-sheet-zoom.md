# 취향 레이더 · 지도 시트 재구성 · 모바일 확대 버그

**날짜**: 2026-08-11
**상태**: 설계 확정, 미구현.
**관련**: `docs/decisions/2026-08-10_judgment-vocabulary.md` §8을 이 문서가 개정한다(§3-4).

세 건을 한 문서에 담는다. §1·§3은 UI 설계, §2는 버그로 원인이 이미 규명됐다.

### 구현 순서 (의존이 있다)

```
§2 확대 버그    독립 — 먼저 나가도 된다. 가장 작고 체감이 크다
§1 취향 레이더  독립 — 브레인 시트만 건드린다
§3 지도 시트    ⚠ judgment-vocabulary 구현이 끝난 뒤에만 가능
```

§3은 `interest`/`verdict` 두 필드를 전제한다(judgment-vocabulary §4). 그 필드가 없는
상태에선 §3-3의 상태 분기를 쓸 수 없다. **§3은 judgment-vocabulary와 같은 계획에
묶어 구현한다** — 하단 시트를 두 번 고치지 않기 위해서다.

---

## §1 취향 레이더 (브레인 시트)

### 1-1. 문제

닉네임을 눌러 여는 브레인 시트(`components/me/brain-sheet.tsx`)가 관심을
`ValueMindMap`으로 그린다 — confidence를 **원의 크기**로 표현하는 방식이다.

- 크기 비교가 눈으로 안 된다. 원 두 개의 넓이 차이는 사람이 못 읽는다.
- **값이 없는 가치는 아예 안 그려진다.** "내가 어디로 치우쳤나"는 안 채운 축이
  같이 보여야 읽히는데, 그 정보가 통째로 빠져 있다.
- "관심 고치기"에 **삭제 경로가 없다**. `addValue`(추가)만 있어서, 이미 있는 가치를
  눌러도 신호가 하나 더 쌓여 원이 커질 뿐 아무 반응이 없는 것처럼 보인다.

### 1-2. 8축 고정 레이더

축은 `src/lib/values/index.ts`의 8가치를 **정의 순서 그대로 고정**한다.

```
발견 discovery · 체험 experience · 굿즈 goods · 소통 social
학습 learning · 트렌드 trend · 영감 inspiration · 가볍게 rest
```

값이 0인 축도 그린다. 축을 고정하면 방문을 거듭해도 모양을 비교할 수 있고,
`/api/me/values`가 이 8개 밖의 값을 400으로 거르는 데이터 모델과도 일치한다.

값 = 해당 slug의 `InterestNode.confidence`(0~1). 노드가 없으면 0.

구성:
- 그리드 폴리곤 4겹 — 0.25 / 0.5 / 0.75 / 1.0
- 축선 8개
- **점선 링 = 확신 임계 0.25** — `taste.ts`·`curate.ts`·`reaction-line.ts`가 공유하는
  그 임계값이다. 이 선 안쪽은 "아직 모르는 것", 바깥은 "확실한 것"
- 데이터 폴리곤 — `--primary` 세로 그라데이션(0.45 → 0.12) + 실선 테두리, 꼭짓점에 점
- 축 라벨 — confidence ≥ 0.25면 진하게(`--foreground`), 아니면 흐리게

라이브러리를 새로 넣지 않는다. 순수 SVG.

**좌표 계산은 순수 모듈로 분리한다** — `src/lib/values/radar.ts`. 컴포넌트 안에
삼각함수를 두면 테스트가 닿지 않는다.

```
radarPoints(values: Record<string, number>, radius: number): { slug, x, y, frac }[]
ringPolygon(frac: number, radius: number): string
```

### 1-3. 관심 고치기 — 삭제를 어떻게 표현하나

브레인은 append-only 신호 원장(`user_signal_log`)에서 **증류**된다. 신호를 지우는
개념이 없으므로 "관심 삭제"를 그대로 구현할 수 없다. 세 가지를 검토했다.

| 안 | 방식 | 판단 |
|---|---|---|
| 음의 신호 | 뺀 slug에 negative 신호 적재 | ✗ confidence가 내려갈 뿐 0이 안 된다. 사용자는 "안 지워졌다"고 느낀다 |
| 전체 목록 멱등 쓰기 | `PUT`으로 목록을 통째로 선언 | ✗ 하나 추가하려다 나머지 7개를 부정하게 된다 |
| **명시적 뮤트** | 사용자가 끈 slug를 브레인에 기록 | ✓ **채택** |

**뮤트가 맞는 이유**: 사용자의 "이건 내 취향 아니야"는 과거 행동을 부정하는 게
아니라 **현재 상태 선언**이다. 원장은 그대로 두고 표시·추천에서만 뺀다. 되돌리기도
자연스럽다.

- `UserBrain`에 `mutedSlugs: string[]` 추가
- 뮤트된 slug는 `interests`에서 제외한다(증류 후 필터). 레이더에선 값 0으로 그린다
- 신호는 계속 쌓인다 — 뮤트를 풀면 그동안의 행동이 반영된 confidence가 그대로 돌아온다

API:
```
POST   /api/me/values           (기존) 가치 추가 = 명시 긍정 신호
PUT    /api/me/values/[slug]    { muted: boolean }   신규
```
`PUT`은 멱등이고, 8가치 밖 slug는 400.

### 1-4. 상호작용

"관심 고치기"를 누르면 **8칸 칩이 전부** 뜬다(지금은 추가용으로만 뜬다).

- 켜진 칩(값 있음 + 뮤트 아님) — `×` 표시. 누르면 `muted: true` → 축이 0으로 내려감
- 꺼진 칩(값 0 또는 뮤트됨) — 누르면 뮤트 해제 + 값이 0이면 `POST`로 명시 긍정 신호
- 차트는 응답 후 즉시 다시 그린다. 낙관적 갱신은 하지 않는다 — confidence는 서버
  증류 결과가 유일한 진실이다(취향 정확도와 같은 규칙)

---

## §2 모바일 화면 확대 버그

### 2-1. 증상

폰에서 지도에 들어가 메모를 누르거나 하단 버튼을 누르면 화면 전체가 확대되고,
두 손가락으로 오므려도 축소되지 않는다.

### 2-2. 원인 — 두 겹, 둘 다 코드에 확정

**(a) 확대되는 이유**: `components/map/map-view.tsx`의 메모 입력이 기본 `Input`의
`text-base`(16px)를 `text-sm`(14px)로 덮는다.

```jsx
className="h-9 pl-8 text-sm"
```

iOS Safari는 **16px 미만 입력창에 포커스가 가면 페이지를 자동 확대**한다. 앱 전체를
훑어 16px 미만이 걸린 입력 요소는 여기 하나뿐이다.

**(b) 축소가 안 되는 이유**: 지도 컨테이너가 브라우저 확대를 세 겹으로 막는다
(`components/map/exhibition-map.tsx`) — `touch-action: none`,
`gesturestart`/`gesturechange` `preventDefault`, `wheel` `preventDefault`.
지도 자체 pan/pinch를 직접 구현하려면 필요한 처리지만, **페이지가 이미 확대된
상태에서 지도 위를 오므리면 그 제스처까지 삼킨다.** 그래서 갇힌다.

하단 시트는 `absolute`로 지도 위에 얹혀 있어 같은 컨테이너 안이다 — 시트 위에서
오므려도 안 풀린다.

### 2-3. 고침

1. `text-sm` 제거 → 기본 16px. **확대가 애초에 안 일어난다**(근본 원인 제거)
2. 하단 시트를 지도 컨테이너 **밖**으로 옮긴다. 시트 위 핀치는 브라우저가 받아
   페이지 확대를 되돌릴 수 있다 — 만에 하나 다른 경로로 확대되더라도 탈출구가 생긴다
3. 회귀 테스트 — 지도 화면의 입력 요소 className에 `text-sm`·`text-xs`가 없는지
   검사한다. 이 실수는 눈으로 안 보이고 폰에서만 드러난다

전역 `user-scalable=no`는 쓰지 않는다. iOS가 무시하고, 글자를 키워야 하는 사용자를
앱 전체에서 막는다(기존 결정 유지).

### 2-4. 로미 영상이 잘리는 문제 (같이 고친다)

전시 홈 히어로의 로미가 잘려 보인다. 원인은 **종횡비 불일치 + `object-cover`**다.

```
headbunting.webm   478 × 620  (세로형)
walk_think.webm    592 × 554
head_spinning.webm 554 × 592
```

`RoamMotion`이 `object-cover`로 렌더하는데 감싸는 박스는 `size-32` 정사각형이다.
cover는 박스를 채우려고 스케일을 키우고 넘치는 부분을 자른다 —
`max(128/478, 128/620) = 0.268` → 렌더 128×166 → **세로 38px이 잘린다**(위아래 19px씩).
머리와 발이 날아간다. `poster="/logo.svg"`도 같은 규칙으로 잘려서 영상이 뜨기 전
로고까지 이상해 보였다.

`rounded-full` 아바타로 쓰는 자리(브레인 시트·회고 시트)도 전부 같은 문제다.

**고침**: `RoamMotion`의 기본을 `object-contain`으로 바꾼다. 규칙은 하나 —
**로미는 자르지 않는다.** 박스가 정사각형이어도 캐릭터 전체가 들어간다. 아바타
자리에서는 원 안에 여백이 조금 생기는데, 잘린 머리보다 낫다.

호출부는 안 바꾼다 — 잘라야 할 자리가 생기면 그때 `className`으로 opt-in 한다.

---

## §3 지도 부스 하단 시트

### 3-1. 현재

`map-view.tsx`의 선택 부스 카드에 이만큼 들어 있다: 부스명 + 코드, 회사명,
CategoryChip, 상세 버튼, 닫기, ValueChips, 메모 입력, **사진 첨부**(`NotePhotos`),
ReactionBar(4칸), `VisitedRetroInline`("여기 어땠어?").

지도 위에 뜨는 시트인데 세로가 길어 도면을 많이 가린다.

### 3-2. 새 구성 (확정안 S1)

```
[썸네일 44]  부스명 · 코드          [상세 ›] [×]
테마칩 · 태그칩
[ 메모 입력 (16px) ]
───────────────────
[ 상태별 3칸 ]
[ 반대편으로 가는 링크 ]
```

- **썸네일** — 피드와 같은 규격을 재사용한다(44px, `rounded-xl`,
  `booth.images[0] ?? booth.logoUrl`, 없으면 카테고리 색 배경 + 이름 첫 글자).
  두 화면이 같은 시각 언어를 쓰게 한다
- **테마** — `ThemeChip`(무엇을 그리는가) / **태그** — `ValueChips`(가치 축)
- **메모** — 16px(§2)

빠지는 것:
- **사진 첨부 아이콘**(`NotePhotos`) → 부스 상세에서만. 지도 위에서 사진을 고르는 건
  현장 동작이 아니다
- **회사명 줄** — 부스명과 거의 겹치면서 한 줄을 먹었다
- **`CategoryChip`** — 테마칩(무엇을 그리는가)이 방문객 판단에 더 붙는 축이라 남기고,
  카테고리(누구인가)는 상세에서 본다. 좁은 시트에 칩 종류가 셋이면 읽히지 않는다
- **`VisitedRetroInline`** — 판정 3칸이 그 역할을 흡수한다(judgment-vocabulary §4)

시각은 앱 기존 컴포넌트·토큰을 그대로 쓴다(`Chip`·`Button`·`Input`·`--shadow-pop`).

### 3-3. 상태 적응형 버튼 — judgment-vocabulary §8 개정

앞선 스펙은 지도 시트를 `mode="both"`(관심 3칸 + "여기 다녀왔어" 링크) 고정으로
정했다. 이를 **관심 여부로 분기**하도록 바꾼다.

| 부스 상태 | 보이는 3칸 | 링크 |
|---|---|---|
| `interest` 없음 · `verdict` 없음 | 꼭 갈래 · 끌려 · 패스 | `여기 다녀왔어 →` |
| `interest` 있음 · `verdict` 없음 | 좋았어 · 그냥그랬어 · 아니었어 | `관심 바꾸기 →` |
| `verdict` 있음 | 판정 3칸(선택 표시) | `관심 바꾸기 →` |

근거: 예전에 검토했던 "상태 자동 분기"는 **"다녀왔는지"를 시스템이 알 방법이 없어**
버렸다(실내 위치 추적 없음). 그런데 **"관심을 눌렀는지"는 우리가 확실히 아는 값**이다.
그걸로 분기하면 추측이 안 들어간다.

의도한 흐름과도 맞는다 — 관심은 관람 전 피드에서 정하고, 현장 지도에서 남는 질문은
판정이다. 관심이 이미 있다는 건 그 단계를 지났다는 뜻이다.

양쪽 상태에 **반대편으로 가는 링크**를 둔다. 어느 쪽에도 갇히지 않는다. 판정 버튼은
미리 선택돼 있지 않으므로, 아직 안 간 부스에서 이 화면이 떠도 누르지 않으면 아무
일도 일어나지 않는다.

### 3-4. 부스 상세 패널

같은 규칙을 쓴다. 지도와 상세가 어긋나면 사용자가 두 개의 다른 앱으로 느낀다.

---

## §4 영향 파일

| 파일 | 변경 |
|---|---|
| `lib/values/radar.ts` | 신규 — 레이더 좌표 계산(순수) |
| `lib/values/radar.test.ts` | 신규 |
| `components/me/taste-radar.tsx` | 신규 — SVG 렌더 |
| `components/me/brain-sheet.tsx` | `ValueMindMap` → `TasteRadar`, 고치기 토글 |
| `components/values/value-mind-map.tsx` | 참조 0이 되면 삭제 |
| `lib/types/index.ts` | `UserBrain.mutedSlugs` 추가 |
| `lib/memory/distill.ts` | 뮤트 slug를 `interests`에서 제외 |
| `app/api/me/values/[slug]/route.ts` | 신규 — `PUT { muted }` |
| repo(mock·supabase) | 브레인 뮤트 읽기·쓰기 |
| `components/companion/roam-motion.tsx` | `object-cover` → `object-contain` (§2-4) |
| `components/map/map-view.tsx` | 시트 재구성, 메모 16px, 시트를 지도 밖으로 |
| `components/booth/judgment-bar.tsx` | 상태 적응형 분기(§3-3) |
| `components/booth/booth-personal-panel.tsx` | 같은 규칙 |
| `docs/decisions/2026-08-10_judgment-vocabulary.md` | §8을 §3-3으로 개정 |

## §5 테스트

- `radar.ts` — 8축 각도·좌표, 값 0/1 경계, 없는 slug는 0
- 뮤트 — 뮤트된 slug가 `interests`에서 빠지는지, 해제 시 confidence가 그대로 돌아오는지
- `judgment-bar` 분기 — 3가지 상태 × 보이는 버튼·링크
- 지도 입력 폰트 회귀 — 지도 화면 입력에 16px 미만 클래스가 없는지

## §6 다루지 않는 것

- **레이더 애니메이션·인터랙션(축 탭·툴팁)** — 정적 렌더까지가 이번 범위
- **`ValueMindMap`을 쓰는 다른 화면** — 브레인 시트 외에 참조가 있으면 그대로 둔다
- **지도 pan/pinch 구현 자체** — §2는 페이지 확대 문제만 다룬다. 지도 자체 제스처는
  건드리지 않는다
