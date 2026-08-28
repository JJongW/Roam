# Roam 웹 레포 — Roam-design 토큰 소비 마이그레이션 설계

**날짜**: 2026-08-28
**범위**: `Roam`(웹) 레포가 `globals.css`에 손으로 써둔 디자인 토큰 값 일부를, 새 단일 소스 레포
`Roam-design`이 생성한 CSS로 교체한다. 브랜드 문서(`docs/brand/`)도 `Roam-design`으로 이관
완료된 상태이므로 이 레포에서 제거하고 안내만 남긴다.
**전제**: `Roam-design`(`~/ted.urssu/Roam-design`)이 이미 토큰 파이프라인 + 브랜드북 전체를
갖추고 `master`에 머지돼 있음 — 이 스펙은 그 산출물을 이 레포가 소비하는 절차만 다룬다.

## 1. 배경

`Roam-design`을 만들 때 웹·iOS·(향후) Android가 공유하는 토큰 단일 소스를 확정했다. 지금까지
웹(`globals.css`)이 그 값들의 **유일한 원본**이었고, iOS는 그 값을 그대로 옮겨 심었다(SD 파이프라인).
이제 웹도 자기가 만든 값을 다시 자기가 손으로 유지하는 대신, `Roam-design`이 생성한 값을
가져다 쓰도록 뒤집는다 — 그래야 앞으로 토큰이 바뀔 때 "웹을 먼저 고치고 iOS가 베낀다"가
아니라 "`Roam-design`을 고치고 웹·iOS 둘 다 재생성"이 된다.

## 2. Vercel 배포 제약과 벤더링

`Roam-design`은 디스크에서 `Roam`의 형제 디렉터리일 뿐이다. `Roam`은 Vercel에 배포되고,
배포 빌드 환경엔 형제 레포 접근이 없다 — 상대경로 import나 로컬 npm `file:` 의존성 둘 다
프로덕션에서 깨진다. 그래서 **벤더링(생성물을 복사해 커밋)** 방식을 쓴다:
`Roam-design/dist/web/tokens.css`를 `Roam/src/styles/tokens.css`로 복사해 커밋한다.

- 토큰이 바뀌면: `Roam-design`에서 `npm run build:tokens` → 이 레포로 재복사 → 커밋.
  **자동 전파 아님** — `Roam-design`의 거버넌스 원칙(스펙 §6)과 동일.
- npm private 레지스트리·git submodule 같은 정식 의존성 관리는 채택하지 않는다 — 1~2인 팀
  규모에서 설정 비용이 이점을 못 넘는다(`Roam-ios` CLAUDE.md와 동일 원칙).

## 3. `globals.css` 실제 구조 재확인 — 마이그레이션 대상 재조정

`globals.css`를 실제로 읽어보니 처음 가정과 다르다. 토큰이 **두 레이어**에 나뉘어 있다:

1. **`:root`/`.dark`의 평범한 커스텀 프로퍼티** — `--background`·`--primary`·`--judge-*`·
   `--spacing-*`·`--motion-*` 등. Tailwind 유틸리티 생성과 무관하게 그냥 값을 담는 변수다.
2. **`@theme inline { ... }` 블록** — Tailwind v4가 여기 선언된 이름으로 실제 유틸리티
   클래스(`rounded-sm`, `shadow-card`, `text-xs`)를 만든다. `--color-*`는 이 블록 안에서
   `:root`의 원시값을 **참조만**(`--color-primary: var(--primary);`) 하지만, **`--radius-sm`
   `~2xl`·`--shadow-*`·`--text-*`는 `:root` 레이어가 아예 없고 `@theme inline` 안에만
   직접 값으로 존재한다.**

즉 색·판단색·모션·스페이싱은 `:root`/`.dark`의 원시값만 바꾸면 끝 — `@theme inline`의
`--color-primary: var(--primary);` 같은 별칭 줄은 그대로 둬도 자동으로 새 값을 받는다.
**라운드 스케일(`--radius-sm~2xl`)·섀도우·타이포는 다르다** — `@theme inline` 안에 직접
있어서, 이걸 안전하게 대체하려면 우리 생성 CSS가 Tailwind의 `@theme` 병합 방식을 정확히
재현해야 한다. 지금 당장 이걸 잘못 다루면 **사이트 전체에서 `rounded-sm`/`shadow-card`/
`text-xs` 같은 유틸리티 클래스가 조용히 깨질 수 있다** — 자동테스트로 안 걸리는 실패 모드다.

**그래서 이번 마이그레이션 범위를 좁힌다.** `@theme inline`에 안 걸리는 카테고리만
1차로 옮기고, 라운드·섀도우·타이포(`@theme` 재현 필요)는 후속으로 미룬다(§9).

| 카테고리 | 위치 | 이번에 옮김? | 지금 산출 | 웹이 기대하는 이름 |
|---|---|---|---|---|
| `color`(베이스 값) | `:root`/`.dark` | ✅ | `--color-primary` | `--primary` (카테고리 접두어 제거) |
| `judgeColor` | `:root`/`.dark` | ✅ | `--judge-color-must` | `--judge-must` |
| `motion.duration` | `:root` | ✅ | `--motion-duration-d1` | `--motion-d1` |
| `motion.easing` | `:root` | ✅ | `--motion-easing-enter` | `--motion-ease-enter` |
| `spacing`(의미 토큰) | `:root` | ✅ | 이미 `--spacing-global-gutter` | 그대로(변경 없음) |
| `radius` | `@theme inline` | ❌ 후속 | — | — |
| `shadow` | `@theme inline`(only) | ❌ 후속 | — | — |
| `typography` | `@theme inline`(only) | ❌ 후속 | — | — |
| `valueColor` | (해당 없음) | ❌ 범위 밖(§4) | — | — |

`Roam-design`의 웹 포맷 함수(`tokens/formats/css.mjs`)는 이번엔 **위 5개 카테고리만**
레거시 이름으로 고친다. 라운드·섀도우·타이포용 코드는 건드리지 않는다(이미 나온 산출물,
지금은 웹이 안 가져다 씀).

**`--judge-must: var(--primary);` 같은 라이브 참조가 하드코딩 값으로 바뀐다.** 지금
`globals.css`는 `judge-must`가 `primary`를 실시간 참조해서, 나중에 `--primary`를 오버라이드하면
`judge-must`도 자동으로 따라간다. `Roam-design`의 `judge-color.json`은 이미 해석된 값을
인라인해 저장하므로(스펙 `2026-08-28-roam-design-brand-token-system-design.md`에서 결정),
이 관계가 끊긴다 — 두 값이 우연히 같을 뿐인 독립 상수가 된다. 지금 당장 `--primary`를 로컬
오버라이드하는 코드가 없어 즉시 문제는 아니지만, 알려진 트레이드오프로 기록한다(§9).

`build-web.test.mjs`의 어서션도 새 이름으로 갱신한다(rem 변환은 이번 범위(색·판단색·모션·
스페이싱)엔 해당 없음 — 전부 정수 hex/ms/px, rem 대상은 타이포뿐이라 후속으로 넘어감).

## 4. 범위 밖

- **가치 색 8종**(`valueColor`, `src/lib/values/index.ts`) — 웹에서 CSS 커스텀 프로퍼티가
  아니라 TS 배열(`VALUE_TAGS`, `label`/`icon`/`color` 묶음)로 소비된다. 소비 형태 자체가
  다르므로 이번 CSS 마이그레이션 대상이 아니다. 후속 항목(TS 산출물을 `Roam-design`이
  내는 문제)으로 남긴다.
- **`Roam-design`에 아직 없는 토큰**(`--primary-foreground`, `--ring`, `--route-line`,
  `--booth-fill`, `--booth-active` 등) — `globals.css`에 손으로 쓴 채 그대로 둔다. 우리가
  실제로 커버하는 토큰의 선언만 지운다 — 부분 마이그레이션, 기능 손실 없음.
- **`brand-voice.test.ts` 로직 변경** — 확인 결과 이 파일은 `docs/brand/`를 **import하지
  않는다**(주석에서만 언급, 실제 검사는 `DICTS`/`LOADING_MESSAGES`/`manifest` 문자열 대상
  정규식). `docs/brand/` 삭제가 이 테스트를 깨지 않는다. 주석 한 줄만
  "브랜드북은 이제 `Roam-design/docs/brand/`에 있다"로 갱신.

## 5. `docs/brand/` 제거

`Roam-design`으로 완전히 이관 완료됐으므로 `Roam/docs/brand/` 전체를 지우고, 그 자리에
`Roam-design` 위치를 가리키는 안내만 남긴다(파일 하나, 몇 줄).

## 6. `globals.css` 변경

- 파일 최상단(`:root` 블록 진입 전)에 `@import "../styles/tokens.css";` 추가(정확한
  상대경로는 실제 파일 위치에 맞춰 구현 시 확정).
- §3에서 ✅ 표시한 5개 카테고리(색 베이스값·판단색·모션 duration/easing·스페이싱 의미
  토큰)의 기존 손 선언만 `:root`/`.dark` 두 블록에서 제거한다.
- **`@theme inline` 블록은 이번엔 손대지 않는다** — 라운드 스케일·섀도우·타이포(§3)가
  거기 살고 있고 이번 마이그레이션 대상이 아니다. `--color-*` 별칭 줄(`--color-primary:
  var(--primary);` 등)도 그대로 둔다 — `:root`의 원시값이 바뀌면 자동으로 새 값을 받는다.
- §4에서 범위 밖으로 남긴 토큰(`--ring`·`--route-line`·`--booth-*` 등)도 그대로 둔다 —
  우리가 실제로 옮기는 5개 카테고리의 선언만 지운다.

## 7. 검증

- **`Roam-design`**: 포맷 함수 변경 후 `npm run build:tokens && npm run test:tokens`(기존
  파이프라인 그대로, 어서션 값만 갱신).
- **`Roam`**: CLAUDE.md 필수 커맨드 — `npx tsc --noEmit`, `npx vitest run`(브랜드 보이스
  가드 포함), `npx eslint <변경 경로>`.
- **시각 회귀**: 프로덕션 전역 스타일시트 변경이라 자동 테스트만으로 안심 못 한다. 개발
  서버(`NEXT_PUBLIC_SUPABASE_URL= ... npx next dev`, mock 모드)로 띄워서 라이트·다크 모드
  둘 다 주요 화면(전시 홈·지도·부스 상세) 스크린샷 전/후 비교.

## 8. 작업 격리

`Roam` 레포에 지금 이 작업과 무관한 미커밋 변경이 20개 가까이 있다(다른 진행 중 작업).
격리된 워크트리에서 작업해 그 변경들을 건드리지 않는다.

## 9. 미해결/후속 항목

- **라운드·섀도우·타이포를 `@theme` 블록으로 마이그레이션** — `Roam-design`의 웹 포맷이
  Tailwind v4의 `@theme` 병합 방식(별도 partial import가 `@theme { ... }` 블록을 내면
  Tailwind가 합쳐서 유틸리티를 생성하는 동작)을 정확히 재현해야 안전하다. 잘못하면 사이트
  전체 유틸리티 클래스가 조용히 깨지는 고위험 변경이라 별도 스펙으로 신중히 설계.
- **`--judge-must`/`--judge-good`의 라이브 참조 끊김** — §3에서 기록한 대로, 마이그레이션
  후 `judge-must`가 `--primary`를 실시간 참조하는 대신 독립 상수가 된다. 지금은 `--primary`
  로컬 오버라이드가 없어 무해하지만, 나중에 생기면 재검토.
- 가치 색 8종을 `Roam-design`이 TS/JS 산출물로도 내야 할지 — 웹의 `VALUE_TAGS.color`가
  진짜 소스 오브 트루스에서 오게 하려면 필요. 지금은 범위 밖.
- `--primary-foreground` 등 누락 토큰을 `Roam-design`에 추가하는 작업(이전 스펙에서도
  파킹된 항목) — 채워지면 이 레포의 부분 마이그레이션도 마저 정리 가능.
- iOS(`Roam-ios`)가 `Roam-design`을 실제로 소비하도록 RoamKit에 연결하는 작업 — 이
  마이그레이션과 독립적, 별도 진행.
