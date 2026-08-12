# 관람 종료 회고 애니메이션(E) — 설계

**날짜**: 2026-08-12
**배경**: CLAUDE.md에 이미 문서화된 "관람 아크(전·중·후) — 회고(peak-end 해소), 회고=기억 쓰기" 방향의 미구현 부분. 기존 회고 화면(`RecapSheet`)은 이미 서사·마감가치·다음질문 3단 구조를 갖추고 있다 — 이번 작업은 그 위에 "예측이 맞았는지"를 보여주는 섹션 하나를 더한다.

## 목적

사용자가 "오늘 관람 마치기"를 누르면, 피드에서 남긴 관심(interest: must·curious·pass)과 지도/부스상세에서 남긴 실제 판정(verdict: good·ok·bad)을 부스별로 대조해 "네 예측이 맞았는지"를 로미가 짧게 짚어주는 탭-넘김 카드 시퀀스를 보여준다.

## 범위 결정 (브레인스토밍에서 확정)

- **삽입 위치**: `RecapSheet` 안, 서사(narrative) 박스 바로 위. 별도 시트를 새로 만들지 않는다.
- **대상 부스**: `interest`와 `verdict`가 **둘 다** 있는 부스만. "다녀왔어" 링크로 interest 없이 verdict만 남긴 부스는 "예측"이 애초에 없어 비교 대상이 아니다.
- **카테고리**: 2단계만 — **적중**(관심 있었는데 결과도 좋았음: must·curious + good·ok / 패스했는데 결과도 안 좋았음: pass + bad) / **반전**(그 반대 조합). 더 세분화하지 않는다.
- **표시 개수**: 최대 3~4개, `judgedClass="confident"`(브레인 확신 가치와 겹치는 부스) 우선 정렬 후 상위. 판정한 부스가 많아도 다 보여주지 않는다 — "빠르게 회고하는 느낌"이 우선이다.
- **넘기는 방식**: 탭해야 다음으로 — 자동 타이머 없음. A(앱 진입 안내)의 `GuideSlide`와 같은 상호작용(진행 점 + 다음 버튼).
- **대상 부스가 0개면**: 섹션 자체를 렌더하지 않는다(빈 상태 UI 없음 — 회고 화면의 나머지 흐름은 지금과 동일하게 진행).

## 아키텍처

### 1. 분류 로직 — `src/lib/memory/retro-outcomes.ts`(신규, 순수 함수)

```ts
export type OutcomeKind = "hit" | "reversal";

export interface OutcomeCard {
  boothId: string;
  boothName: string;
  interest: "must" | "curious" | "pass";
  verdict: "good" | "ok" | "bad";
  kind: OutcomeKind;
}
```

`classifyOutcome(interest, verdict): OutcomeKind` — 관심(must·curious → "관심 있었다") vs 결과(good·ok → "좋았다")가 같은 방향이면 적중, 다르면 반전. `buildOutcomeCards(notes, boothNameById, limit=4): OutcomeCard[]` — interest+verdict 둘 다 있는 노트만 필터 → `judgedClass="confident"` 우선 정렬 → 상위 `limit`개.

### 2. 데이터 소스 — `GET /api/me/recap` 확장

`ensureLatestRecap`이 돌려주는 `VisitDigest.exhibitionId`를 이용해 `repo.listBoothsByExhibitionId(exhibitionId)`로 부스 이름 맵을 만들고, D2에서 이미 만든 `repo.listNotesByBoothIds(boothIds)`로 이 전시 스코프의 노트만 가져와 `buildOutcomeCards`에 넘긴다. 응답에 `outcomeCards: OutcomeCard[]` 필드를 추가.

### 3. UI — `src/components/route/visit-outcome-cards.tsx`(신규)

`app-onboarding.tsx`의 `GuideSlide`와 동일한 구조(로컬 `step` state, 진행 점, "다음" 탭으로 전진, 마지막 카드는 "확인"으로 닫음). 카드 한 장 = 부스 이름 + 로미 한 줄. 로미 대사는 judgment-vocabulary 때 만든 배열 기반 i18n(`companion.retroHit`/`companion.retroReversal`, 각 여러 변형)에서 무작위로 골라 `{booth}` 치환. `RecapSheet`가 `outcomeCards.length > 0`일 때만 이 컴포넌트를 서사 박스 바로 위에 렌더 — 별도 게이트 없이 항상 마운트, 사용자가 자기 속도로 탭해서 넘긴다(밑의 서사·마감가치는 동시에 보여도 무방 — 강제로 가리지 않는다).

## 테스트

`classifyOutcome`/`buildOutcomeCards`는 순수 함수라 유닛테스트(정렬·필터·limit·hit/reversal 판정 경계값). API 라우트 확장과 UI 컴포넌트는 이 프로젝트의 기존 관례상(다른 회고 관련 컴포넌트도 테스트 없음) 별도 테스트 없이 tsc+eslint로 검증한다.

## 스코프 밖

- interest·verdict 어느 한쪽만 있는 부스(비교 불가)
- 4단계 이상 세분화된 카테고리
- 자동 타이머 진행
- 카드 개수 제한 없이 전체 나열
