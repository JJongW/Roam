# ⚠️ 데드코드 (지우거나 되살리기 전엔 믿지 말 것)

_CLAUDE.md에서 옮겨 옴(2026-11-21)._

호출부 0: `components/map/map-view.tsx`(v1 지도 화면, 11-18 v2로 바뀜. 테스트만 읽는다) · `ai/booth-recommender.ts` · `onboarding/onboarding-{flow,inference,types}.ts` · `stores/onboarding.ts` ·
repo의 `logAiQuery`/`topQueryKeywords`(+ `ai_query_log` 테이블).

**한 번도 안 쓴 UI 모듈**(참조 0): `ui/{slider,separator,progress}.tsx` · `common/rating.tsx`.
(쓰는 건 `progress-circle.tsx`뿐. `menu.tsx`의 `MenuSeparator`는 Radix를 직접 그린 별개다.)

**안 쓰는 하위 export**(모듈은 살아 있음): `states.tsx`의 `Spinner` · `card.tsx`의
`Card{Header,Title,Description,Content,Footer}`(호출부는 `<Card className=…>`) ·
`MenuGroup`/`MenuGroupLabel` · `SelectGroup` · `SheetTrigger`/`SheetClose`.

⚠️ **이것들은 디자인 시스템에도 넣지 않는다.** 코드에 없는 걸 Figma에 만들면 디자이너가
그걸 쓰고, 그때 가서 컴포넌트를 거꾸로 만들게 된다. Figma에 넣을 땐 **호출부가 1곳이라도
있는지 먼저 센다.**

mock(`seed*.ts`)은 아직 전시별 JSON을 import한다(미정리). `scripts/gen-seed.mjs`는 **실행 불가**(gitignore된 `supabase/seed.sql`을 연다).
