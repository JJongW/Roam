# 계측 규격 — 웹 · iOS 공통

> **웹과 iOS가 같은 어휘로 쏘게 하는 단일 문서.** 여기서 벗어난 이벤트는 집계에
> 잡히지 않는다. 어휘 추가·변경은 `src/lib/types/index.ts`의 enum을 고치는 것으로만
> 하고, 이 문서를 함께 갱신한다.
>
> 관련: `docs/admin-automation-architecture.md` §12-①

---

## 계측 표면은 둘뿐이다

| | `POST /api/analytics/events` | `POST /api/me/signal` |
|---|---|---|
| **성격** | 행동 계측 (무엇을 눌렀나) | 학습 원장 (무엇을 판단했나) |
| **키** | `session_id` + **`user_id`** | `user_id` |
| **인증** | 없어도 202 | **로그인 필수** (401) |
| **응답** | `204 No Content` 아님 — `202`, 본문 없음 | `204 No Content` |
| **실패 시** | 무시 (fire-and-forget) | 재시도 권장 |
| **쓰이는 곳** | 히트맵·동선·퍼널·UI 클릭 | 추천 정확도·UserBrain·취향 |

> ⚠️ **둘 다 쏴야 한다.** `/api/me/signal`을 안 부르면 로미가 학습하지 못하고
> 추천 정확도 지표가 비어버린다. 반대로 `/api/analytics/events`만 없으면
> 행동 분석이 통째로 사라진다.

---

## 1. `POST /api/analytics/events`

### 요청 본문

```jsonc
{
  "type": "ui_click",        // 필수 — 아래 7종 중 하나
  "boothId": "bth_...",      // 선택 — 부스 관련 이벤트면
  "exhibitionId": "exh_...", // 선택 — boothId가 없을 때 귀속용(권장)
  "exhibitionSlug": "sibf-2026", // 선택 — exhibitionId 없을 때만 (slug→id 조회 발생)
  "x": 0.42,                 // 선택 — 지도 좌표(정규화 0~1)
  "y": 0.71,
  "meta": { "target": "map-zoom-in" } // 선택 — 자유 키/값
}
```

**귀속 우선순위**: `boothId`로 조회한 전시 > `exhibitionId` > `exhibitionSlug` > 세션 값.
세션 값은 최초 생성 시점에 고정되므로 신뢰하지 않는다 — **가능하면 `exhibitionId`를 직접 실어라**(조회 왕복이 사라진다).

### `type` — `AnalyticsType` 7종

| 값 | 언제 | 필수 동반 필드 |
|---|---|---|
| `view` | 부스 상세를 열었을 때 | `boothId` |
| `dwell` | 부스 상세 체류 종료 시 | `boothId`, `meta.seconds` |
| `route_start` | 관람 시작 | — |
| `route_complete` | "오늘 관람 마치기" 완료 | — |
| **`booth_arrive`** ★ | **현장에서 부스에 도착** | `boothId` |
| `event_bookmark` | 이벤트 북마크 | `boothId` |
| `ui_click` | 그 외 모든 UI 클릭 | `meta.target` |

★ `booth_arrive`는 **현장 방문자 판별의 근거**다 (→ 아키텍처 §12-③).
원격에서 피드만 보는 사용자와 실제로 온 사용자를 가르는 유일한 신호이므로,
현장 진입 판정 로직이 있다면 반드시 이걸 쏴야 한다.

### `meta.target` 명명 규칙 (`ui_click`)

`{화면}-{요소}-{동작}` 케밥케이스. 예: `feed-card-open` · `map-zoom-in` ·
`booth-detail-tab-review` · `companion-bar-open`.
**자유롭게 늘려도 되지만 한번 정한 이름은 바꾸지 않는다** — 바꾸면 과거 집계와 끊긴다.

---

## 2. `POST /api/me/signal`

### 요청 본문

```jsonc
{
  "kind": "reaction_must",  // 필수 — 아래 9종 중 하나
  "boothId": "bth_..."      // 필수
}
```

### `kind` — `SignalKind` 9종

**판단 어휘는 관람 전/후가 직교한다.** 이게 로미가 "내 추천이 틀렸다"를 배우는 유일한 방법이므로 **섞으면 안 된다.**

| 시점 | 값 | UI 문구 | 의미 |
|---|---|---|---|
| **관람 전** (예측) | `reaction_must` | 꼭 갈래 | 가겠다고 정함 |
| | `reaction_curious` | 끌려 | 좋은데 확정은 아님 |
| | `reaction_pass` | 패스 | 카드만 보고 거절 |
| **현장** (결과) | `verdict_good` | 좋았어 | 몸으로 확인한 긍정 |
| | `verdict_ok` | 그냥그랬어 | 중립 |
| | `verdict_bad` | 아니었어 | 가보고 아니었다 |
| **행위** | `feed_click` | — | 피드 카드 열람 |
| | `booth_bookmarked` | — | 북마크 |
| | `search_query` | — | 검색 |

> **추천 정확도 = `reaction_*`(예측) vs `verdict_*`(결과) 일치율.**
> 둘 중 하나만 오면 계산이 안 된다. 회고 화면에서 `verdict_*`를 반드시 받아야 한다.

> ⚠️ `route_saved`는 enum에서 **의도적으로 제외**돼 있다. 호출부가 없는데 가중치만
> 무거워서 표면만 넓혔던 값이다. 되살리려면 실제 기능부터.

---

## 3. iOS 구현 체크리스트

- [ ] `/api/auth/apple/native` 또는 `/api/auth/google/native`로 로그인 → `roam_user` 쿠키 획득
- [ ] 이후 모든 요청에 그 쿠키 전달 (**`/api/me/signal`은 없으면 401**)
- [ ] `AnalyticsType` 7종을 웹과 동일한 이름으로 전송 — 자체 이름 금지
- [ ] `SignalKind` 9종 전송 — 특히 **`verdict_*`를 빠뜨리지 말 것**
- [ ] `booth_arrive`를 현장 진입 시 전송
- [ ] `ui_click`의 `meta.target`은 웹과 같은 명명 규칙 (화면 이름이 달라도 형식은 동일)
- [ ] `exhibitionId`를 직접 실어 slug 조회 왕복 제거
- [ ] 두 엔드포인트 모두 실패해도 앱 흐름을 막지 않을 것 (analytics는 특히)

## 4. 서버 측 계약 (변경 시 양쪽 동시 반영)

| 항목 | 위치 |
|---|---|
| `AnalyticsType` enum | `src/lib/types/index.ts` |
| `SignalKind` enum | `src/lib/types/index.ts` |
| 요청 검증 스키마 | `src/lib/schemas/index.ts` — `analyticsEventInputSchema` |
| signal 검증 스키마 | `src/app/api/me/signal/route.ts` (라우트 로컬) |
| 적재 | `Repository.recordAnalytics` / `recordSignal` |

**enum이 단일 진실이다.** 문자열을 코드에 직접 쓰지 말고 enum에서 가져다 쓴다.
