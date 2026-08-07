# SEED 디자인 시스템 정렬 3단계 — 부족한 컴포넌트 채우기 Design

**Goal:** 로드맵 문서가 짚었던 후보(Alert Dialog·Dialog·Chip·Avatar·Callout) 중 실제
코드 재조사로 확인된 진짜 필요·진짜 중복만 골라 3개를 새로 만든다: Alert Dialog(삭제
확인 통일), Chip(칩 4종 중복 통합), ImageLightbox(이미지 라이트박스 중복 통합).

**Architecture:** 전부 `src/components/ui/`(공용) 또는 `src/components/common/`에 신규
파일로 추가하고, 기존 소비처는 최대한 이름을 유지한 채 내부만 새 컴포넌트를 쓰도록
바꾼다(호출부 코드 무변경 지향). 새 의존성은 `@radix-ui/react-alert-dialog` 하나만
추가 — 이미 설치된 `@radix-ui/react-dialog`(Sheet가 씀)와 같은 계열, shadcn 관례
그대로.

## Global Constraints

- **Avatar는 이번 스코프에서 뺀다** — `RoamAvatar` 구현이 하나뿐이라 통합할 중복이
  없다(로드맵의 가정이 틀렸음, 재조사로 확인).
- **Callout(GroundingCard 일반화)도 이번 스코프에서 뺀다** — 두 번째 실사용처가 없어
  일반화할 근거 부족(YAGNI). 나중에 실제 두 번째 소비처가 생기면 재논의.
- **로드맵의 "Dialog"(AppOnboardingGate 승격)는 방향이 틀렸다** — 그건 배경 위 모달이
  아니라 전체화면 전환이라 SEED의 중앙 모달 Dialog와 안 맞는다. 대신 실제로 발견한
  진짜 중복(이미지 라이트박스)을 다룬다.
- Chip은 **크기·구조(variant 개념)만 SEED를 따르고, 색은 Roam 고유 방식(카테고리·
  가치별 동적 hex color)을 유지**한다 — 색은 Roam에서 분류 정보를 나르는 실제 기능이라
  SEED의 고정 팔레트+선택상태 반전 모델로 대체하지 않는다(사용자 확인됨).
- Roam은 라이트 모드만 지원 — 다크모드 검증 불필요.
- 새 컴포넌트는 1·2단계에서 만든 토큰(radius/shadow/motion/typography)을 그대로 쓴다
  — 새 임의값 만들지 않는다.

---

## 섹션 A — Alert Dialog

**SEED 스펙 확인(seed-design.io/components/alert-dialog):**
- 구조: Header(제목+선택적 닫기) / Body(설명) / Footer(액션 버튼)
- 액션은 **닫기 포함 2개 이하** — 이분법적 선택(삭제/유지, 확인/취소)
- 버튼 위계: Neutral(기본) / Brand(제품 가치와 맞는 긍정 액션) / Critical(데이터
  삭제·작성 내용 소실 등 파괴적 액션 — **경고 액션 자체**에 표시하지, 취소 버튼엔
  안 씀)
- Dialog와의 차이: **반드시 선택 필요** — 배경 클릭으로 안 닫힘(Dialog는 닫힘). Esc나
  버튼 클릭으로만 닫힌다.

**구현 (`src/components/ui/alert-dialog.tsx`, 신규):**
`@radix-ui/react-alert-dialog` 설치 후 `Sheet`(`src/components/ui/sheet.tsx`)와 같은
패턴으로 래핑 — `AlertDialog`/`AlertDialogTrigger`/`AlertDialogContent`/
`AlertDialogHeader`/`AlertDialogTitle`/`AlertDialogDescription`/`AlertDialogFooter`/
`AlertDialogAction`/`AlertDialogCancel`을 export. 스타일은 기존 `Card`·`Button`
토큰(`--radius-xl`, `--shadow-pop`) 그대로 사용, 새 값 안 만듦. `AlertDialogAction`은
기존 `buttonVariants({variant: "destructive"})`를 받을 수 있게(파괴적 액션용).

**교체 대상 (3곳, 전부 삭제 확인):**
| 파일 | 기존 | 교체 후 |
|---|---|---|
| `src/components/admin/event-manager.tsx:69` | `if (!confirm(...)) return;` | `AlertDialog` + `AlertDialogAction`(destructive) |
| `src/components/admin/booth-manager.tsx:96` | `if (!confirm(...)) return;` | 동일 패턴 |
| `src/components/community/community-view.tsx:88` | `if (!window.confirm(...)) return;` | 동일 패턴(단, 이건 삭제가 아니라 신고 확인이라 destructive 대신 기본 Confirm) |

각 파일의 삭제 트리거 버튼(현재 즉시 `confirm()` 호출)을 `AlertDialogTrigger`로 감싸고,
문구(`'${title}' 삭제할까요?` 등)는 기존 그대로 `AlertDialogDescription`에 옮긴다 —
카피 변경 없음.

## 섹션 B — Chip

**SEED 스펙 확인(seed-design.io/components/chip):**
- 크기 3단(고정 px): sm 32px / md 36px / lg 40px
- variant 3종(고정 팔레트 전제): Solid(기본 채움) / Outline Strong(진한 테두리) /
  Outline Weak(옅은 테두리, 낮은 주목도 선택 상황 권장)
- prefix 슬롯: 아이콘·아바타·이미지 / suffix 슬롯: 보통 remove 버튼
- 상태: Enabled/Pressed/Disabled/Selected(반전색)

**Roam 적용 — 재해석:**
Roam 칩은 전부 정적 표시용(클릭 불가)이고 색은 카테고리·가치별 고유 hex다. 크기만
SEED 3단을 그대로 쓰고, variant는 실사용 패턴에 맞춰 2개로 정리한다(3번째는 지금
쓸 곳이 없어 안 만듦, YAGNI):
- `tint`(기본): 배경 10% 틴트 + 진한 텍스트 — Roam이 원래 하던 방식이자 SEED의
  Solid 역할을 동적 색으로 구현한 버전
- `outline`: 테두리 + `bg-card` — SEED의 Outline Strong/Weak를 하나로 합침(Roam엔
  낮은/높은 주목도 구분 쓸 곳이 없음)

**구현 (`src/components/ui/chip.tsx`, 신규):**
```tsx
interface ChipProps {
  variant?: "tint" | "outline"; // 기본 "tint"
  size?: "sm" | "md" | "lg"; // 기본 "sm"
  color?: string; // hex, 기본 --primary
  icon?: React.ReactNode; // prefix 슬롯
  children: React.ReactNode;
  className?: string;
}
```
높이는 `size`에 따라 `h-8`(32px)/`h-9`(36px)/`h-10`(40px), `tint`는
`style={{ backgroundColor: \`${color}1a\`, color }}`(color 없으면 `var(--primary)`),
`outline`은 `border border-border bg-card text-foreground/90`.

**교체 대상 (4곳):**
| 파일 | 방식 |
|---|---|
| `src/components/booth/theme-chip.tsx` | 내부에서 `<Chip variant="tint">` 호출, export 이름·props 그대로(호출부 무변경) |
| `src/components/booth/category-chip.tsx` | 내부에서 `<Chip variant="tint" color={category.color} icon={<Icon .../>}>` 호출, export 이름·props 그대로 |
| `src/components/values/value-chips.tsx` | 내부에서 `<Chip variant="tint" color={d.color}>` 호출(맵 루프 안), export 이름·props 그대로 |
| `src/components/booth/booth-highlights.tsx` | 신간·굿즈 인라인 `<span>` 2곳을 `<Chip variant="outline" size="md">`로 교체 |

## 섹션 C — ImageLightbox

`src/components/booth/booth-gallery.tsx`와 `src/components/exhibition/poster-viewer.tsx`의
오버레이 부분(배경 클릭 닫힘·Esc 리스너·이미지·X 닫기 버튼)이 거의 완전히 동일 —
공유 컴포넌트로 뽑는다. SEED엔 대응 컴포넌트 없음(순수 Roam 자체 중복 제거).

**구현 (`src/components/common/image-lightbox.tsx`, 신규):**
```tsx
interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}
```
기존 두 파일의 오버레이 JSX(`fixed inset-0 z-[110] ... bg-black/85 backdrop-blur-sm`,
Esc `useEffect`, X 버튼)를 그대로 옮긴다. 이미지엔 `shadow-[var(--shadow-pop)]`를
**둘 다 적용**(현재 `poster-viewer.tsx`만 갖고 있던 것 — 같은 UI 패턴이라 없던 쪽이
누락으로 보고 통일).

**교체 대상 (2곳):**
- `booth-gallery.tsx`: `open !== null`일 때 `<ImageLightbox src={images[open]} alt={name} onClose={() => setOpen(null)} />` — 썸네일 그리드(트리거)와 `open` state(index 관리)는 그대로 둠.
- `poster-viewer.tsx`: `open`일 때 `<ImageLightbox src={src} alt={name} onClose={() => setOpen(false)} />` — 확대보기 버튼(트리거)과 `open` state(boolean)는 그대로 둠.

---

## 에러 처리 / 엣지 케이스

전부 UI 컴포넌트 교체라 별도 실패 시나리오 없음. Alert Dialog 도입으로 기존 3곳의
삭제 확인 문구·취소 시 동작(조기 return)은 카피·로직 변경 없이 그대로 유지한다.

## 테스트

- Alert Dialog·ImageLightbox: 로직 없는 UI 컴포넌트라 단위 테스트 대상 없음.
- Chip: `variant`/`size`에 따른 클래스 매핑이 순수 함수면 분리해 유닛 테스트 가능(구현
  단계에서 결정) — 아니면 정적 렌더라 테스트 불필요.
- 전체: `npx tsc --noEmit`, `npx eslint <변경 파일>`, `npx vitest run` 회귀 확인.
- 수동 확인(라이트 모드만): 삭제 확인 3곳이 Alert Dialog로 뜨는지(취소·확인 둘 다),
  칩 4곳이 시각적으로 깨지지 않는지, 라이트박스 2곳(부스 갤러리·포스터)이 그대로
  동작하는지(Esc·배경 클릭·X 버튼 전부).
