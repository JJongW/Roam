# admin 계정 상세 확장(D1) — 설계 문서

**날짜**: 2026-08-11
**상태**: 사용자 승인 완료, 구현 계획 대기

## 배경

관리자가 `/admin/accounts/[id]`에서 특정 사용자의 반응 타임라인·북마크는 볼 수 있지만, (1) 타임라인이 그냥 최신순 나열이라 어느 날 뭘 했는지 한눈에 안 들어오고, (2) 사용자별 취향이 어느 쪽으로 치우쳤는지 볼 방법이 아예 없다(방문객 자신은 `/`·전시 홈의 "내 취향 보기"에서 `TasteRadar`로 볼 수 있지만 admin엔 없음).

## 범위

**포함**: 계정 상세 페이지에 취향 레이더 섹션 추가, 반응 타임라인에 날짜 구분 헤더 추가.

**제외**: 오류/이슈 모니터링(D2, 별도 트랙). booth_enrichment 편집(범위 밖으로 이미 확정).

## 설계

### 1. API — 취향 데이터 추가

`GET /api/admin/users/[id]`(기존, `requireAdmin()`으로 이미 보호됨) 응답에 `values: Record<string, number>` 필드를 추가한다. 방문객 자신의 "내 취향" 화면(`brain-sheet.tsx`)과 정확히 같은 파생 로직을 재사용한다:

```ts
const brain = await readBrain(id); // src/lib/memory/service.ts, 없으면 emptyBrain
const values: Record<string, number> = {};
for (const n of brain.interests) {
  if (valueDef(n.key)) values[n.key] = n.confidence; // 8가치 축만, 분야 slug 노드는 제외
}
```

`readBrain`은 이미 서버 전용(`server-only`) 함수라 Route Handler에서 바로 쓸 수 있다. `valueDef`는 `src/lib/values/index.ts`에 이미 있다.

### 2. 화면 — 취향 레이더 섹션

계정 상세 페이지에 "취향" `AdminSection`을 신설해 반응 타임라인 섹션 바로 위에 배치한다. 내용은 기존 `TasteRadar` 컴포넌트(`src/components/me/taste-radar.tsx`)를 그대로 재사용 — 새 시각화를 만들지 않는다:

```tsx
<TasteRadar values={values} label={(s) => t(`values.${s}`)} />
```

방문객 화면(`brain-sheet.tsx`)이 이미 이 정확한 호출 패턴을 쓰고 있다. `values`가 완전히 비어 있으면(신호 없는 신규 계정) 레이더는 8개 축이 전부 0인 모양으로 그려지는데, 이는 기존 컴포넌트의 정상 동작이라 별도 빈 상태 처리를 추가하지 않는다(축이 비어 보이는 것 자체가 "아직 파악 안 됨"이라는 정보다).

### 3. 화면 — 타임라인 날짜 구분 헤더

기존 `events.map((e) => <TimelineRow key={e.id} event={e} />)` 렌더링을 날짜별로 그루핑해서, 날짜가 바뀌는 지점마다 헤더를 끼워 넣는다. 새 컴포넌트를 만들지 않고 계정 상세 페이지 안에서 직접 그루핑한다 — `TimelineRow`는 개별 이벤트 렌더에만 집중하는 순수 프레젠테이션 컴포넌트로 그대로 둔다.

날짜 포맷은 `TimelineRow`가 이미 쓰는 `date-fns`의 `format`을 재사용해 `"2026년 8월 11일"` 형태(`format(date, "yyyy년 M월 d일")`)로 통일한다.

## 자기 점검

- **플레이스홀더 없음**: API 응답 필드·파생 로직·컴포넌트 재사용 경로가 모두 실제 기존 코드를 정확히 가리킨다.
- **내부 일관성**: `values` 파생 로직이 `brain-sheet.tsx`의 기존 로직과 완전히 동일해, 방문객이 자기 화면에서 보는 것과 관리자가 보는 것이 같은 계산 결과를 낸다 — 어긋날 여지가 없다.
- **범위 점검**: API 응답 필드 1개 추가 + 페이지 컴포넌트 1개 확장으로 끝나는 크기.
- **모호성 점검**: "날짜별로 보여준다"가 그루핑 헤더 방식이라는 것, 레이더 위치가 타임라인 바로 위라는 것 모두 사용자 확인 완료.
