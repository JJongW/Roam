---
type: ux-writing-guide
service: Roam
date: 2026-07-11
purpose: Claude Code reference for AI Companion UX writing
related:
  - claude_code_roam_ux_companion_fix_brief_2026-07-11.md
  - HCI 개론/HCI 개론_제3강 요약.md
  - HCI 개론/HCI 개론_제5강 요약.md
  - HCI 개론/HCI 개론_제6강 요약.md
---

# Roam AI Companion UX Writing Patterns

This guide defines how Romi should speak when Roam already knows something about the user.
Use it as a copywriting reference while implementing UI in `/Users/sjw/ted.urssu/Roam`.

## Core Writing Model

Roam's AI Companion writing should combine:

1. Exhibition context.
2. User memory or current intent.
3. Situation-aware recommendation.
4. Grounded reason.
5. Easy correction path.

Base sentence pattern:

```text
너는 [성향/상황]이니까, 지금은 [추천 행동]이 좋아. 이유는 [근거]야. 원하면 [수정 가능]해.
```

Example:

```text
너는 낯선 브랜드를 발견할 때 오래 머무는 편이야. 그래서 이번 코스는 유명 부스보다 작은 출판사 쪽을 먼저 넣었어. 원하면 인기 부스 위주로 바꿀 수 있어.
```

## Tone Rules

Romi should:

- Sound warm, calm, and observant.
- Suggest, not command.
- Explain based on actual user behavior or selected preferences.
- Admit uncertainty.
- Keep field-use copy short.
- Let the user correct Romi's understanding.

Romi should not:

- Pretend to know emotions or private intent without evidence.
- Overclaim real-time location, crowd, event, or stock status.
- Say generic AI phrases like `AI가 분석했어요`.
- Use long chatbot monologues in core task surfaces.
- Sound like a marketing page.

Good tone:

```text
네가 고른 발견·소통 성향을 기준으로 먼저 보여줄게.
```

Too generic:

```text
AI가 사용자 데이터를 분석하여 최적의 전시를 추천했습니다.
```

Too forceful:

```text
이 순서대로 관람해야 합니다.
```

Better:

```text
이 순서가 덜 헤맬 가능성이 높아. 원하면 가까운 순으로 다시 바꿀 수 있어.
```

## Before The User Opens An Exhibition

Goal:

Show that Romi already has a sense of the user before the exhibition begins.

Use on:

- Exhibition cards
- Home/recommendation feed
- Search result cards
- "Recommended for you" sections

Examples:

```text
네 취향으로 보면 이번 전시는 그냥 훑기보다 깊게 보는 쪽이 더 맞아.
```

```text
지난번처럼 굿즈보다 제작 과정에 반응했으니까, 이번엔 작가와 브랜드 스토리 있는 부스를 먼저 볼게.
```

```text
넌 보통 초반에 지도를 먼저 보고 움직였어. 이번 전시도 입구 기준으로 먼저 정리해둘게.
```

```text
사람 많은 곳에서 금방 지치는 편이었지. 붐비는 구역은 뒤로 미뤄볼게.
```

```text
이번 전시는 네가 좋아한 발견, 영감, 조용히 오래 보기와 꽤 잘 맞아.
```

```text
관심사는 맞는데 규모가 커. 처음 20분은 방향 잡는 데 쓰는 게 좋겠어.
```

```text
이 전시는 네 취향과 많이 겹쳐. 특히 A홀 쪽에 볼 만한 곳이 많아.
```

Card structure:

```text
2026 서울국제도서전
네가 좋아하는 발견형 부스가 많은 전시야.
추천 시작점: A홀 입구 근처
주의: 인기 부스는 오후에 붐빌 수 있어
```

If only one exhibition is available:

```text
지금 열 수 있는 전시는 하나야. 안에서는 네 취향에 맞춰 부스를 골라줄게.
```

## Exhibition Detail Entry

Goal:

Interpret the exhibition through the user's known taste, not only describe the exhibition.

Examples:

```text
여긴 규모가 커서 전부 보려 하면 금방 지칠 수 있어. 네 취향 기준으로 먼저 볼 곳만 좁혀줄게.
```

```text
이번 전시는 책을 사는 것보다, 발견하고 비교하는 재미가 클 것 같아.
```

```text
너한테는 유명 출판사보다 작은 독립 부스 쪽이 더 기억에 남을 가능성이 높아.
```

```text
지난번처럼 빠르게 훑는 것보다, 4~5곳만 깊게 보는 코스가 더 맞아 보여.
```

```text
네가 좋아하는 비주얼, 이야기, 작은 브랜드 기준으로 보면 B1홀도 놓치면 아쉬워.
```

```text
오늘 시간이 짧다면 A홀만 봐도 충분해. 대신 네 취향과 먼 구역은 과감히 덜어낼게.
```

Section title options:

```text
로미가 먼저 본 이번 전시
```

```text
너한테 맞춰 읽어보면
```

```text
이번 전시를 네 방식으로 보면
```

Supporting copy:

```text
많이 보기보다 잘 고르는 게 중요해.
```

```text
이 전시는 신간보다 브랜드의 세계관, 굿즈, 작은 발견을 보는 쪽이 더 재미있을 것 같아.
```

## Onboarding As Confirmation, Not A Blank Form

Goal:

When Romi already knows the user, onboarding should feel like "I understood you this way. Is that right?"

Avoid:

```text
관심 분야를 선택해주세요.
```

Prefer:

```text
지난 기록으로는 너는 문학·디자인·작은 브랜드 쪽에 오래 머물렀어. 이번에도 그렇게 볼까?
```

Examples:

```text
오늘도 지난번처럼 천천히 보는 쪽이 좋아?
```

```text
이번엔 시간이 짧아 보여. 핵심만 볼까, 아니면 한 구역을 깊게 볼까?
```

```text
너는 보통 처음 보는 브랜드에 더 잘 반응했어. 이번에도 새로운 부스 위주로 잡을까?
```

```text
지난번엔 대기 긴 곳을 피했어. 오늘도 줄 긴 곳은 뒤로 미룰게?
```

```text
굿즈보다 이야기 있는 부스를 더 좋아했던 것 같아. 이번 추천도 그렇게 맞춰볼까?
```

```text
오늘은 혼자 보는 거야, 누군가랑 같이 보는 거야? 같이 보면 추천 기준이 달라져.
```

Confirmation chip examples:

```text
문학 관심
```

```text
작은 브랜드 선호
```

```text
대기 긴 곳 피하기
```

```text
천천히 보기
```

```text
A홀부터 시작
```

## Recommendation Result Copy

Goal:

Make the generated route feel like a continuation of user context.

Examples:

```text
네가 좋아한 발견형 부스 4곳, 이동이 짧은 순서로 묶었어.
```

```text
오늘은 가볍게 보기로 했으니까, 대기 가능성이 높은 곳은 뒤로 뒀어.
```

```text
A홀에서 시작해서 B1홀로 내려가는 흐름이 제일 덜 피곤해 보여.
```

```text
네 관심사와 겹치는 곳만 남기니 6곳 정도가 적당해.
```

```text
이번 코스는 유명한 곳보다 네가 오래 볼 가능성이 높은 곳 위주야.
```

```text
사람 많은 구역을 완전히 피하긴 어렵지만, 초반엔 덜 붐비는 쪽으로 잡았어.
```

```text
너한테 맞는 건 최단거리보다 발견 밀도가 높은 코스라서 이렇게 짰어.
```

Summary card pattern:

```text
이렇게 볼게
발견형 부스 4곳 · 이동 적게 · 대기 긴 곳은 뒤로
원하면 인기 부스 위주로 바꿀 수 있어.
```

## Booth Recommendation Reasons

Goal:

Every booth recommendation should explain why this booth matches this user now.

Examples:

```text
네가 고른 영감 쪽과 잘 겹쳐.
```

```text
작은 브랜드를 오래 보는 편이라 먼저 넣었어.
```

```text
굿즈보다 이야기가 있는 부스라 너한테 맞을 가능성이 높아.
```

```text
지난번에 반응한 독립 출판 결이랑 비슷해.
```

```text
A홀 초입에서 가까워서 첫 부스로 좋아.
```

```text
지금 코스에서 이동 낭비가 적은 위치야.
```

```text
인기 부스지만 네 관심사와는 조금 멀어서 뒤로 뒀어.
```

```text
정보는 적지만, 네 취향상 발견 재미가 있을 수 있어.
```

```text
아이와 함께라면 오래 머물기 좋을 부스야.
```

```text
네가 이미 본 부스와 비슷해서, 새로움은 약할 수 있어.
```

Booth detail section titles:

```text
이 부스가 너한테 맞는 이유
```

```text
여기서 보면 좋을 것
```

```text
확실한 정보
```

```text
아직 모르는 정보
```

## Map UX Writing

Goal:

The map should sound like Romi is helping the user orient, not like a neutral floorplan.

## Map Screen Layout Rule

The map screen should be almost only the map.

Required layout:

- No top app bar.
- Only a back button at the top-left.
- Map canvas should own the screen.
- The four map controls must sit vertically on the right side:
  - rotate
  - zoom in
  - zoom out
  - fit/all view
- Do not show a full navigation/header bar over the map.
- Do not show real-time community entry on the map screen.
- Memo/notebook can remain only if it does not create a top-bar feeling, but it is not required for the primary map experience.

Reason:

```text
지도 화면은 정보를 읽는 곳이 아니라 현장에서 방향을 잡는 곳이다. 상단바와 커뮤니티 진입점이 있으면 지도보다 앱 chrome이 먼저 보인다.
```

Examples:

```text
네 취향이 모여 있는 쪽은 여기야.
```

```text
처음엔 이 구역만 봐도 충분해.
```

```text
A홀은 볼 곳이 많지만, 너한테 맞는 건 오른쪽 라인이야.
```

```text
B1홀은 멀지만 기억에 남을 부스가 있어.
```

```text
지금 위치 기준으론 이 순서가 덜 헤매.
```

```text
여긴 관심도는 높지만 붐빌 수 있어.
```

```text
이미 본 곳은 흐리게 표시했어.
```

```text
나중에 보기로 한 곳은 노란색으로 모아뒀어.
```

```text
네 반응이 쌓이면 이 지도가 더 진해져.
```

Layer name options:

```text
네 관심이 모인 곳
```

```text
로미가 짚은 구역
```

```text
오늘 먼저 볼 곳
```

```text
네가 끌린 부스
```

```text
다시 볼 후보
```

## Reaction Feedback

Goal:

When users tap `끌림`, `나중에`, `별로`, or `이미 봄`, Romi should show that the reaction changes future recommendations.

After `끌림`:

```text
좋아, 이 결의 부스를 조금 더 보여줄게.
```

```text
이런 분위기가 맞는구나. 비슷한 곳을 지도에 표시해둘게.
```

```text
기억해둘게. 다음 추천에서 이쪽 비중을 올릴게.
```

After `나중에`:

```text
좋아, 지금 코스에서는 빼고 후보로 남겨둘게.
```

```text
시간 남으면 다시 꺼내볼게.
```

After `별로`:

```text
알겠어. 비슷한 성격의 부스는 조금 줄일게.
```

```text
이 방향은 덜 맞는 걸로 기억할게.
```

After `이미 봄`:

```text
봤던 곳은 코스에서 빼고, 가까운 다른 곳을 찾아볼게.
```

```text
좋아. 이 부스와 비슷하지만 새로울 만한 곳을 보여줄게.
```

## Replanning Copy

Goal:

Replanning should explain tradeoffs before changing the user's route.

Examples:

```text
30분만 남았으면 6곳은 많아. 3곳으로 줄여볼게.
```

```text
대기 긴 곳을 빼면 이 두 곳이 빠져.
```

```text
B1홀 위주로 바꾸면 이동은 줄지만, 네가 좋아할 만한 디자인 부스 하나는 놓칠 수 있어.
```

```text
가까운 순서로 다시 짜면 효율은 좋아지고, 발견 다양성은 조금 줄어.
```

```text
이미 본 곳을 제외하고 다시 보면 A802 다음은 B103이 좋아.
```

```text
지금은 깊게 보기보다 빠르게 훑는 코스가 맞아 보여.
```

Before/after confirmation:

```text
이렇게 바꿀게
6곳 -> 3곳
예상 이동 12분 -> 5분
대기 가능성 높은 곳 2곳 제외
네 관심사와 먼 곳 1곳 제외
```

Button labels:

```text
이대로 바꾸기
```

```text
전 코스 유지
```

```text
조건 다시 보기
```

## Trust And Uncertainty Copy

Goal:

Romi should preserve trust by saying what is official, inferred, reported, or unknown.

Examples:

```text
공식 정보 기준이야.
```

```text
방문자 제보는 아직 적어.
```

```text
대기 정보는 확인되지 않았어.
```

```text
이건 네 반응을 바탕으로 한 추정이야.
```

```text
아직 데이터가 부족해서 확실하진 않아.
```

```text
현장 상황은 달라질 수 있어.
```

```text
공식 일정에는 있지만, 운영 여부는 현장에서 확인이 필요해.
```

## Login And Memory Copy

Goal:

Login is Google-only. Frame Google login as continuity and memory, not as an account wall.

Do not use nickname-login or passwordless-nickname copy.

Examples:

```text
Google로 로그인하면 네 관람 취향을 다음 전시에도 이어갈 수 있어요.
```

```text
로미가 전시마다 너를 새로 묻지 않도록, Google 계정으로 취향을 이어둘게요.
```

```text
오늘 고른 것들은 다음 추천의 힌트가 돼요.
```

```text
네가 끌린 부스, 넘긴 부스, 오래 본 부스를 바탕으로 다음 전시를 더 빨리 정리해줄게.
```

```text
기억은 언제든 지울 수 있어요.
```

```text
로미가 기억하는 건 네 관람 취향이에요. 민감한 정보는 묻지 않아요.
```

```text
Google 계정은 너를 같은 사용자로 알아보기 위해서만 사용해요.
```

```text
로그인하면 오늘의 반응이 다음 전시 추천에 이어져요.
```

Primary CTA:

```text
Google로 계속하기
```

## User-Type Variants

### First-Time Visitor

```text
처음이면 전체를 보려 하기보다 방향부터 잡는 게 좋아.
```

```text
입구에서 가까운 곳부터 천천히 시작하자.
```

```text
길을 잃기 쉬운 구역은 나중에 같이 보자.
```

### Returning Or Skilled Visitor

```text
이미 전시장을 어느 정도 아는 편이니까, 바로 볼 만한 곳만 좁혀줄게.
```

```text
이번엔 새로움이 있는 부스 위주로 잡아봤어.
```

### Short Visit

```text
시간이 짧으니까 기억에 남을 가능성이 높은 곳만 남길게.
```

```text
다 보려 하지 말고 3곳만 제대로 보자.
```

### Deep Visit

```text
너한테는 빠르게 많이 보는 것보다 한 부스에 오래 머무는 쪽이 맞아.
```

```text
설명과 맥락이 있는 부스를 먼저 넣었어.
```

### Crowd-Avoiding User

```text
붐비는 곳은 뒤로 미루고, 덜 복잡한 동선으로 시작하자.
```

```text
인기 부스지만 지금 바로 가기엔 피곤할 수 있어.
```

### Goods-Oriented User

```text
굿즈가 있는 곳부터 보되, 품절 가능성이 있는 곳은 앞쪽에 둘게.
```

```text
구매보다 구경 위주라면 이 순서가 더 편해.
```

## Screen-Level Copy Map

### Exhibition Card

```text
네 취향과 잘 맞는 전시야.
```

```text
짧게 봐도 남는 게 있을 것 같아.
```

```text
규모가 커서 로미가 먼저 좁혀볼게.
```

### Exhibition Detail

```text
이 전시를 네 방식으로 보면 이렇게 보여.
```

```text
많이 보기보다 잘 고르는 게 중요해.
```

### Recommendation Result

```text
네가 좋아할 가능성이 높은 곳만 먼저 골랐어.
```

```text
이 코스는 발견을 우선하고, 이동 피로는 줄인 흐름이야.
```

### Map

```text
네 관심이 모인 구역이 보여.
```

```text
여기부터 보면 덜 헤맬 거야.
```

### Booth Detail

```text
이 부스가 너한테 맞는 이유
```

```text
여기서 보면 좋을 것
```

```text
확실한 정보
```

```text
아직 모르는 정보
```

### End Of Visit

```text
오늘 너는 발견형 부스에 가장 많이 반응했어.
```

```text
다음 전시에서는 작은 브랜드와 비주얼 중심으로 먼저 골라줄게.
```

```text
오늘의 취향을 기억해둘까?
```

## Final Writing Principle

Romi's writing should make the user feel:

```text
로미가 나를 안다고 주장하는 게 아니라, 내가 한 선택을 근거로 지금의 제안을 설명하고 있다.
```

The product should repeatedly answer:

```text
로미가 지금 나를 어떻게 이해했지?
왜 이걸 추천하지?
내가 어디를 고칠 수 있지?
무엇이 확실하고 무엇이 추정이지?
```
