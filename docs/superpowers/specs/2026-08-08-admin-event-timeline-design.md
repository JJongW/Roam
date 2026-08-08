# 관리자 이벤트 타임라인 + 계정 관리 Design

**Goal:** 원시 이벤트(반응+조회)를 시간순으로 보는 관리자 타임라인과, 지금 관리 화면이
없는 계정(`app_user`)의 조회+삭제 화면을 만든다. 계정 목록은 그 사람의 전체 반응
타임라인·북마크로 들어가는 드릴다운 진입점을 겸한다.

**Architecture:** 새 admin 페이지 2개(`/admin/timeline`, `/admin/accounts` + 드릴다운
`/admin/accounts/[id]`)를 기존 `/admin` 레이아웃·컴포넌트 관례(`AdminSection`, `Card`,
`EmptyState`) 위에 얹는다. 새 저장소 메서드 몇 개(전시 단위 신호 조회, 계정 목록/삭제)를
추가하고, 3단계에서 만든 `AlertDialog`·`Chip`을 삭제 확인·필터 UI에 재사용한다.

## Global Constraints

- 새로 만드는 API 라우트는 전부 `isAdminAuthed()` 체크 필수(기존 admin 라우트들은
  이 체크가 빠져있는 상태 — 그건 별도 이슈로 두고 손 안 댐).
- **커뮤니티 포스트 관리는 이번 스코프에서 제외** — `CommunityPost`가 `sessionId`로만
  연결되고 `userId`가 없어(CLAUDE.md에 이미 기록된 감사 P1-2, 미해결) 계정에 못 붙는다.
  나중에 이 연결이 해결되면 별도 작업으로 다룬다.
- 북마크는 전체 목록 화면을 안 만든다 — 계정 드릴다운 안에서만(기존
  `listBookmarks(userId)` 재사용) 보여준다.
- `/admin/timeline`은 `pickAdminExhibition`으로 전시 자동 선택(선택 UI 없음,
  `/admin/analytics`와 같은 관례).
- `AnalyticsEvent`는 `sessionId`(익명, `userId` 없음) 기반이라 계정 드릴다운엔 안
  보인다 — 전시 전체 타임라인(`/admin/timeline`)에서만 보인다.
- 실시간 갱신 없음 — 새로고침 버튼 기반(사용자 확인, 어제 grilling).
- 삭제는 조회+삭제만, 수정 기능 없음.
- 새 컴포넌트 안 만듦 — 3단계에서 만든 `AlertDialog`(삭제 확인)·`Chip`(필터)을
  재사용한다.

---

## 섹션 A — 데이터 레이어 (신규 저장소 메서드)

기존 `Repository` 인터페이스(`src/lib/repositories/types.ts`)에 추가:

```ts
/** 전시 전체 사용자 신호 조회(관리자 타임라인용) — listUserSignals와 달리 userId로 안 좁힘. */
listExhibitionSignals(
  exhibitionId: string,
  opts?: { limit?: number },
): Promise<UserSignal[]>;

/** 계정 목록(관리자용, 최신 가입순). */
listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]>;

/** 계정 삭제(관리자용). 존재 안 하면 false. */
deleteUser(id: string): Promise<boolean>;
```

`_allAnalytics(exhibitionId)`(이미 존재, optional 메서드)와 `listUserSignals`/
`listBookmarks`(이미 존재)는 그대로 재사용 — 새로 안 만듦.

## 섹션 B — `/admin/timeline`

- `pickAdminExhibition`으로 전시 자동 선택.
- `listExhibitionSignals(exhibitionId)` + `_allAnalytics(exhibitionId)` 결과를
  `createdAt` 기준 내림차순 병합.
- 상단 필터: `Chip`(`variant="outline"`, 선택 시 `variant="tint"`)로 반응
  종류(`SignalKind`)·이벤트 종류(`AnalyticsType`) 토글 — 클라이언트 사이드 필터링
  (다시 조회 안 함).
- 행: 시각 · 종류(아이콘+라벨) · 사용자(`UserSignal`이면 닉네임 링크 →
  `/admin/accounts/[id]`, `AnalyticsEvent`면 "익명 세션") · 부스 코드(있으면) · 상세
  (`meta`/`slugs` 요약).
- 새로고침 버튼(수동) — polling·실시간 없음.
- 비어있으면 기존 `EmptyState` 재사용.

## 섹션 C — `/admin/accounts`

- `listUsers()`로 전체 계정 목록: 닉네임 · 가입 방식(닉네임/구글, `provider` 필드
  유무) · 가입일.
- 행 클릭(닉네임) → `/admin/accounts/[id]`.
- 각 행에 삭제 버튼 → `AlertDialog`(destructive) → `deleteUser(id)`.

## 섹션 D — `/admin/accounts/[id]` (드릴다운)

- 그 사람의 `UserSignal` 전체(`listUserSignals(userId)`, 기존 메서드 그대로) —
  섹션 B와 같은 행 컴포넌트 공유(사용자 컬럼만 생략).
- 그 사람의 북마크 목록(`listBookmarks(userId)`, 기존) + 삭제(`removeBookmark`, 기존)
  — 각 북마크 대상(부스/이벤트) 이름과 함께.
- 커뮤니티 포스트·`AnalyticsEvent`는 위 Global Constraints 사유로 여기 없음.

## 섹션 E — API 라우트

| 경로 | 메서드 | 용도 |
|---|---|---|
| `/api/admin/timeline` | GET | `exhibitionId` 쿼리로 병합된 이벤트 목록 |
| `/api/admin/users` | GET | 계정 목록 |
| `/api/admin/users/[id]` | GET | 계정 상세(드릴다운 데이터: 신호+북마크) |
| `/api/admin/users/[id]` | DELETE | 계정 삭제 |

전부 `isAdminAuthed()` 체크(Global Constraints).

---

## 에러 처리 / 엣지 케이스

- 삭제 실패(네트워크 등) → 토스트만(기존 admin 관례, `event-manager.tsx`/
  `booth-manager.tsx`와 동일 패턴).
- 목록이 비어있으면 `EmptyState`.
- 존재하지 않는 `[id]`로 드릴다운 접근 시 "계정을 찾을 수 없어요" 안내 후 목록으로
  돌아가는 링크.

## 테스트

- `listExhibitionSignals`/`listUsers`/`deleteUser` — mock repository에 순수 로직으로
  구현되니 유닛 테스트(입력 exhibitionId/limit에 따른 필터링, 삭제 후 목록 반영 등).
- API 라우트 — `isAdminAuthed()` 미충족 시 401 반환하는지 통합 테스트.
- UI는 정적 렌더 위주라 `tsc`/`eslint`/`vitest run` 회귀 + 수동 확인(라이트 모드만):
  타임라인 필터 칩 토글, 계정 목록→드릴다운 이동, 드릴다운의 신호·북마크 표시,
  삭제 확인 다이얼로그 동작(취소·삭제 둘 다).
