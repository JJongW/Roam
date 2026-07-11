---
type: claude-code-implementation-brief
service: Roam
date: 2026-07-11
source_url: https://roam-eosin.vercel.app
related:
  - roam_ai_companion_ux_direction_2026-07-02.md
  - roam_smart_exhibition_qa_ux_audit_2026-06-16.md
  - claude_code_prompt_roam_gemini_ai_features_2026-06-16.md
  - HCI 개론/HCI 개론_제3강 요약.md
  - HCI 개론/HCI 개론_제5강 요약.md
  - HCI 개론/HCI 개론_제6강 요약.md
  - roam_ai_companion_ux_writing_patterns_2026-07-11.md
  - /Users/sjw/ted.urssu/Roam/CLAUDE.md
---

# Roam UX Companion Fix Brief for Claude Code

This document is written for Claude Code working in `/Users/sjw/ted.urssu/Roam`.
Use it as the current UX implementation brief after the 2026-07-11 deployed-product review.

## Current Product Direction To Preserve

Roam should not become a generic chatbot or a route-only utility.

This brief should be read through the AI Companion class-note lens from:

- `HCI 개론/HCI 개론_제3강 요약.md`
- `HCI 개론/HCI 개론_제5강 요약.md`
- `HCI 개론/HCI 개론_제6강 요약.md`
- `roam_ai_companion_ux_writing_patterns_2026-07-11.md`

From those notes, AI Companion is not merely "AI features." It means a product that moves beyond usability, usefulness, and emotion into:

- **Relationship**: the user understands the system as something that shares activity, time, context, and decisions with them.
- **Acceptability**: the user can accept the system's ability, attention, and role as appropriate to their life/task.
- **Role / Interaction / Experience fit**: the product has a clear companion role, the interaction needed to perform that role, and a felt experience value.
- **Intent-based interaction**: the user exchanges intent with the system, gets feedback, and can revise the outcome.
- **Experience value over AI novelty**: AI is valuable only when it helps perception, cognition, judgment, decision, or emotion in the user's real context.

From `roam_ai_companion_ux_direction_2026-07-02.md`, the intended product is:

> Roam is a mobile AI companion that helps visitors quickly decide what is worth seeing now, given their skill level, remaining time, interests, and exhibition context.

The AI Companion should behave as:

- A quiet decision-support layer, not a full-screen chat surface.
- A route/context explainer, not an authority that silently decides.
- A field-use assistant optimized for mobile, short attention, and uncertain indoor positioning.
- A trust-preserving system that distinguishes official data, visitor reports, AI inference, and unknown data.
- A strategy helper, not a fake real-time GPS navigator.

Key principles to preserve:

- Suggest, do not decide.
- Explain why.
- Stay quiet by default.
- Protect trust before intelligence.
- Mobile first, landscape expanded.
- Strategy over tracking.
- Split novice and expert needs.

## Class-Note Companion Lens Applied To Roam

Use this section as the conceptual evaluation frame before implementing UI changes.

### 1. Relationship

Class-note meaning:

- A companion is not just a useful tool. It becomes meaningful through shared activity, shared time, shared decisions, and repeated interaction.
- Relationship quality depends on frequency, information-exchange density, and how the user interprets the relationship.

Roam today:

- Romi has a warmer tone and appears across onboarding, recommendation, detail, and map.
- However, relationship is still mostly expressed through copy. The system does not yet strongly show what it remembers, how the user's answers changed the experience, or how interaction deepens over time.

Implementation implication:

- Romi should show accumulated context in small, grounded ways:
  - `아까 발견 쪽을 골라서 이 부스를 먼저 보여줄게.`
  - `이미 본 곳은 빼고 근처에서 3곳만 다시 골랐어.`
  - `오늘은 가볍게 보기로 했으니 대기 긴 곳은 뒤로 뒀어.`
- This relationship should be task-based companionship, not fake friendship.

### 2. Acceptability

Class-note meaning:

- Acceptability is the user's ability to accept what the system is, what it can do, and why its help is appropriate.
- The system must express attention to the user without overclaiming ability.

Roam today:

- Google-only login can be acceptable if it clearly explains memory, continuity, and preference portability.
- But skeleton-only loading, unclear recommendation reasons, and weak map salience reduce acceptability because the user cannot tell whether Romi is capable or stuck.
- Login-required architecture can be acceptable only if it is framed as memory/continuity, not as an arbitrary wall.

Implementation implication:

- Make Romi's capability and limits explicit:
  - `실내 위치는 정확하지 않을 수 있어서, 네 선택과 부스 위치 기준으로 정리할게.`
  - `공식 정보 기준이야. 현장 제보는 아직 적어.`
  - `지금은 서울국제도서전 한 곳만 열 수 있어. 안에서는 네 취향에 맞춰 골라줄게.`
- Show loading/retry states so the user can accept waiting as system work, not failure.

### 3. Role / Interaction / Experience

Class-note meaning:

- AI companion products need a clear definition across Role, Interaction, and Experience.

Roam target definition:

- **Role**: a field-use exhibition decision companion.
- **Interaction**: short choices, map reactions, grounded explanations, and lightweight replanning.
- **Experience**: the visitor feels less lost, decides faster, and can explain why the chosen booths are worth seeing.

Current mismatch:

- Role is becoming clear through Romi.
- Interaction still leans toward one-way recommendation rather than continuous feedback/revision.
- Experience is weakened by loading uncertainty and lack of visible progress/reasoning.

Implementation implication:

- Every key recommendation surface should answer:
  - What did Romi understand?
  - Why is this being suggested?
  - What can the user change?
  - What is unknown or based on weak data?

### 4. What AI Companion Means For This Project

Do not implement "AI Companion" as a bigger chat UI.

For Roam, AI Companion means:

- Shared context: Romi carries the user's visit intent across onboarding, recommendations, map, and booth detail.
- Shared decision-making: Romi proposes, explains, and lets the user revise.
- Repeated lightweight interaction: reactions like `끌림`, `나중에`, `별로`, `이미 봄` should visibly change later suggestions.
- Acceptable limits: Romi distinguishes official data, visitor reports, AI inference, and unknowns.
- Field confidence: loading, errors, and uncertainty are understandable in the moment.

## 2026-07-11 Live UX Findings

Tested against `https://roam-eosin.vercel.app` on desktop and mobile viewport.

Observed flow:

1. `/` redirects to `/login?next=%2F`.
2. First-run language selector appears before login.
3. Login policy should be Google-only.
4. User is taken through Romi onboarding before the exhibition list/result.
5. Onboarding completes into a single recommended exhibition card.
6. Exhibition detail, map, and booth detail are available, but several screens have long skeleton-only loading states.

What improved since the older 2026-06-16 audit:

- Roam now has a stronger companion tone.
- Login and language choice are cleaner, but login copy should reflect Google-only memory continuity.
- Recommendation cards have stronger brand and visual identity.
- Exhibition detail has better companion entry points: `오늘 뭘 남기고 싶어?`, `관심 밀도 지도`, viewing modes.
- Map fidelity is much better than the first QA pass.
- Booth detail structure is richer and more polished.

Main remaining UX gap:

The concept is now clear, but field-use state feedback is still weak. The service sometimes looks stalled exactly when a visitor needs fast confidence.

## P0 Fixes

### P0-1. Replace Skeleton-Only Loading With Meaningful State Copy

Problem:

- Mobile exhibition detail first showed only pale skeleton blocks plus the floating Romi button for several seconds.
- Mobile map also showed skeleton-only content before the actual SVG map appeared.
- Booth detail direct open initially looked stuck before content loaded.
- In a field setting, this reads as broken, not as loading.

Expected implementation:

- Every slow route/view must show a screen-specific loading message, not only skeleton blocks.
- Use existing loading-message patterns if available. `CLAUDE.md` mentions `LOADING_MESSAGES.route` and `useRotatingMessage`; reuse or extend this pattern.
- Add an error or retry fallback for map/detail data load failure.

Suggested copy:

- Exhibition detail: `전시 정보를 불러오고 있어요.`
- Map: `전시장 지도를 준비하고 있어요.`
- Booth detail: `부스 정보를 확인하고 있어요.`
- Long wait after ~4s: `조금만 더 기다려줘. 부스 데이터를 맞추는 중이에요.`
- Failure: `불러오지 못했어요. 다시 시도할까요?`

Acceptance criteria:

- At 390x844, no main screen is skeleton-only for more than the first instant.
- Loading text is visible without scrolling.
- Loading state does not expose only the floating Romi CTA as the main content.
- Failure state has a retry action.

Likely areas to inspect:

- `src/app/exhibitions/[slug]/...`
- `src/app/exhibitions/[slug]/map/...`
- `src/app/booths/[id]/...`
- loading components under `src/app/**/loading.tsx`
- shared loading copy/hooks under `src/lib` or `src/components`

### P0-2. Add Onboarding Progress And Keep It Screen-Reader Clean

Problem:

- Romi onboarding asks multiple questions, but there is no visible progress such as `1/5`.
- During onboarding, the underlying home/exhibition content remains present in the DOM. A screen reader can encounter both the active question and background content.

Expected implementation:

- Add subtle progress: `1/5`, a thin progress bar, or copy like `거의 다 왔어`.
- Keep it visually quiet. Do not make onboarding feel like a long form.
- Hide background content from assistive tech while onboarding is active.
- Use `aria-hidden`, modal semantics, or actual conditional rendering so only the active onboarding step is read.

Acceptance criteria:

- User can tell how many steps remain.
- DOM/accessibility snapshot does not expose inactive home/exhibition cards during onboarding.
- Keyboard focus remains inside the active onboarding choice set.
- Choice buttons remain large enough for mobile.

Likely areas to inspect:

- `components/onboarding/ai-companion-onboarding.tsx`
- `src/lib/onboarding/onboarding-flow.ts`
- any overlay/sheet wrapper used for Romi onboarding

### P0-3. Explain The Recommendation At The Moment It Appears

Problem:

- After onboarding, the home screen showed one recommended exhibition card.
- The card says `로미 추천`, but it is not clear whether this is truly personalized or just the only available exhibition.
- This weakens the `Explain why` principle.

Expected implementation:

- Add a short route/exhibition-level reason near the first recommendation.
- Keep it grounded in actual onboarding answers or deterministic fallback data.
- If only one exhibition exists, be honest: use copy that frames it as the current available exhibition plus how Roam will use preferences inside it.

Suggested copy:

- `네가 고른 발견·소통 성향을 기준으로 먼저 보여줄게.`
- If only one exhibition exists: `지금 열 수 있는 전시는 하나야. 안에서는 네 취향에 맞춰 부스를 골라줄게.`

Acceptance criteria:

- The first recommendation has one concise reason.
- The reason does not invent data.
- The reason survives Gemini failure using deterministic templates.

Likely areas to inspect:

- home/exhibition list page
- recommendation card component
- feed grounding helpers: `src/lib/feed/grounding.ts`, `components/feed/grounding-card.tsx`

## P1 Fixes

### P1-1. Make The Map Look Like A "Preference Density Map" Immediately

Problem:

- The map SVG is faithful and useful, but the first visual impression is still a neutral floorplan.
- At default zoom, booth names are mostly unreadable.
- Recommended/interested booths do not pop strongly enough.
- The map screen currently risks feeling like an app page with top chrome, rather than a focused field-use map.

Expected implementation:

- The map screen should be almost only the map.
- Remove the top app bar from the map screen.
- Keep only a back button at the top-left.
- Put the four map controls vertically on the right side:
  - rotate
  - zoom in
  - zoom out
  - fit/all view
- Remove the real-time community entry from the map screen.
- Memo/notebook is optional, but it must not create a top-bar feeling if retained.
- Make selected/recommended/interested booths visually more salient at default zoom.
- Add a small always-available legend for color/state meaning.
- Use zoom-level label rules:
  - low zoom: hall/area + selected booth pins
  - medium zoom: booth codes
  - high zoom: booth code + name
- Do not rely on color alone; add outline, icon, or badge.

Acceptance criteria:

- At 390x844 and 1280x720, the map screen has no top app bar.
- Only the back button appears at the top-left.
- Rotate, zoom in, zoom out, and fit/all view controls are stacked on the right side.
- No real-time community shortcut appears on the map screen.
- At 390x844 and 1280x720, a user can identify where Romi wants them to look first without zooming.
- Legend explains at least `visited`, `interested`, and `recommended`/density states.
- Recommended booths are perceivable without reading tiny booth labels.

Likely areas to inspect:

- map view components
- SVG booth renderer
- heat/density layer components
- map controls and topbar components

### P1-2. Avoid Floating Romi CTA Covering Content

Problem:

- On mobile exhibition detail, the floating Romi CTA can overlap recommendation card content near the bottom.

Expected implementation:

- Add bottom safe padding to scroll containers where the floating CTA appears.
- Consider shrinking or collapsing the CTA during scroll.
- Make sure primary card actions remain tappable and readable.

Acceptance criteria:

- At 390x844, the floating CTA does not cover card text or action buttons.
- Bottom content can scroll above the CTA.
- CTA respects safe-area insets.

Likely areas to inspect:

- floating companion component
- exhibition detail layout
- route/recommendation card list container

### P1-3. Improve Poster Cropping In Exhibition Detail

Problem:

- Desktop detail uses a powerful poster split layout, but the poster is cropped so hard that core poster information is cut off.
- Mobile hero also behaves more like an atmospheric background than inspectable event media.

Expected implementation:

- Adjust object-fit/object-position or add a "view poster" affordance.
- Preserve visual impact while keeping the event identity legible.

Acceptance criteria:

- Desktop 1280x720 does not crop away too much of the title/date signal.
- Mobile top hero still feels branded but does not hide all meaningful poster content.

Likely areas to inspect:

- exhibition hero/detail component
- image object-position styles

## P2 Fixes

### P2-1. Tighten Map Guide Modal

Problem:

- The map guide modal is helpful, but it blocks the map and contains a lot of copy.
- Users who just want to orient themselves must dismiss before seeing the actual map.

Expected implementation:

- Keep first-run guide, but shorten it.
- Consider a compact `?` help affordance after dismissal.
- Let the blurred background show enough map context if possible.

Acceptance criteria:

- First guide explains only the controls needed to start.
- User can reopen guide.
- Copy fits comfortably on 390x844.

### P2-2. Preserve Login-Gated Direction But Clarify It

Context:

- Older UX notes preferred anonymous/local usage.
- Current `CLAUDE.md` says login is now intentionally required for long-term memory and cross-exhibition user model.
- Product policy is now Google login only. Do not reintroduce nickname login.

Implementation guidance:

- Do not revert login gating unless explicitly asked.
- Instead, make login feel like memory setup, not an account wall.
- Use copy such as `Google로 로그인하면 네 관람 취향을 다음 전시에도 이어갈 수 있어요.`
- Make Google the only login CTA.
- Do not show nickname login, passwordless nickname copy, or "Google optional" messaging.

Acceptance criteria:

- Login explains the benefit of memory/continuity.
- Google login is the only visible authentication path.
- Copy explains why Google identity is used for continuity across exhibitions.
- Privacy/control copy remains clear: what Romi remembers and how to manage it.

## Do Not Do

- Do not turn Romi into a generic full-screen chatbot.
- Do not claim real-time location accuracy unless the feature actually has a reliable source.
- Do not let Gemini decide route geometry, booth existence, or factual status without deterministic validation.
- Do not invent event, goods, waiting, or crowd claims.
- Do not add decorative AI copy that does not help a field decision.
- Do not remove the current login-required architecture without a product decision.

## Suggested Implementation Order

1. Add loading state copy and retry fallback for exhibition detail, map, and booth detail.
2. Add onboarding progress and hide inactive background content from assistive tech.
3. Add first recommendation reason/fallback.
4. Add mobile safe padding for floating Romi CTA.
5. Strengthen map recommendation/density visual layer.
6. Adjust poster crop.
7. Shorten map guide modal.

## Validation Checklist

Run:

```bash
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```

Manual viewport checks:

- 390x844 mobile:
  - login
  - Romi onboarding
  - home/recommended exhibition
  - exhibition detail
  - map first load and map after guide dismissal
  - booth detail direct open
- 1280x720 desktop:
  - onboarding question layout
  - exhibition detail split layout
  - map default zoom

Accessibility checks:

- Active onboarding step is the only onboarding/home content read.
- Buttons have clear accessible names.
- Map icon controls keep accessible names.
- Loading and error states are announced or visible as text.

## Summary For Claude Code

The 2026-07-11 deployed build has a much stronger Romi/AI Companion identity than earlier audits. Keep that direction. The next work should make the product feel reliable in the field: meaningful loading states, clear onboarding progress, grounded recommendation reasons, readable map salience, and no floating CTA overlap.
