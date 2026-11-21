# 옛 화면 (지금 닿지 않음)

_CLAUDE.md에서 옮겨 옴(2026-11-21)._

> 근거 카드와 가치 온보딩은 옛 홈 화면에 있었고 지금 방문객 흐름에서 닿지 않는다(CLAUDE.md "주요 도메인"의 방문객 플로우).
> 코드를 되살리거나 고칠 때만 참고한다. 새 화면의 규칙으로 쓰지 않는다.

## 로미 문장 규칙 (근거 카드)
- `src/lib/feed/grounding.ts`(순수) → `curateFeed`가 FeedItem에 attach → `components/feed/interest-feed.tsx`가 렌더.
- ⚠️ **로미 발화에 가치 이름을 쓰지 않는다.** 한 줄 = **부스가 무엇인지(사실)** + **왜 지금 너한테(내가 실제로 누른 부스)**.
- 사실 절은 항상 채워진다: `roamInterpretation` > `recommendationReasons` > `summary` > `booth.name`
  (`booth.company`는 시드에서 카테고리 요약이라 쓰지 않는다).
- 근거 절은 피드당 최대 2번(`createLinkPicker`의 `maxUses`). 없을 수는 있어도 **지어내지 않는다**.

## 온보딩 = 가치 선택
- 별도 페이지 없음. 전시 홈의 `components/onboarding/value-onboarding.tsx` → `POST /api/me/values` →
  `recordSignal`(explicit) → 브레인 재증류 → 피드 즉시 반영.
- 가치 slug 단일 소스 `src/lib/values/index.ts`. 8개 밖의 값은 `/api/me/values`가 400.
- 취향 정확도는 `getTasteAccuracy`(booth_note 집계). 예전 `tasteProgress`는 삭제됐다.

## 피드 (iOS가 쓰는 `/api/exhibitions/[slug]/feed` 때문에 남아 있음)
- **피드 큐레이션엔 LLM 없음**: `curateFeed`(feed/curate.ts)는 순수 결정론.
- **피드는 6칸짜리 결정 큐다**(`rhythm.ts`): 반응한 부스는 **전부** 큐에서 빠진다(되돌아보는 곳은 지도 색과 메모장).
  새로 고르기는 **목록 맨 아래 버튼으로만** — 읽는 중에 화면이 다시 그려지면 안 된다.
  새 카드는 '여기부터 새로 골랐어요' 아래에만 붙는다.
