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

## 3. 네이밍·단위 — `Roam-design` 쪽 선행 변경

지금 `Roam-design`이 iOS/신규 소비자를 염두에 두고 붙인 이름(`--color-primary`,
`--judge-color-must`)이 웹이 이미 참조 중인 이름(`--primary`, `--judge-must`)과 다르다.
Tailwind v4가 `--primary` 같은 기존 이름을 직접 참조하므로, **`Roam-design`의 웹 포맷
함수를 레거시 이름에 맞춰 고친다**(alias 레이어를 웹에 얹는 대신) — 아직 `Roam-design`에
외부 소비자가 없어 지금 바꾸는 비용이 제일 싸다.

| 카테고리 | 지금 산출 | 웹이 기대하는 이름 |
|---|---|---|
| `color` | `--color-primary` | `--primary` (카테고리 접두어 제거) |
| `judgeColor` | `--judge-color-must` | `--judge-must` |
| `radius.default` | `--radius-default` | `--radius` (접미사 없음) |
| `radius`/`typography`의 `xl2`/`xl3` | `--radius-xl2`, `--text-xl2` | `--radius-2xl`, `--text-2xl` (Swift 식별자 회피용 리네임을 웹 출력에서 원복) |
| `typography` 사이즈 | `--typography-xs-size: 12px;` | `--text-xs: 0.75rem;`(px→rem 변환, `--text-` 접두어) |
| `typography` line-height | `--typography-xs-line-height: 16px;` | `--text-xs--line-height: 1rem;`(Tailwind v4 이중대시 컨벤션 유지) |
| `spacing`/`motion`/`shadow` | 이미 `--spacing-global-gutter`/`--motion-duration-d1`/`--shadow-card` | `--spacing-global-gutter`/`--motion-d1`/`--shadow-card` — motion만 `duration-` 세그먼트 제거 |
| `motion.easing` | `--motion-easing-enter` | `--motion-ease-enter` |
| `valueColor` | (범위 밖, §4 참고) | — |

**rem 변환은 웹 출력에만 적용한다.** iOS Swift 산출물은 그대로 px(`CGFloat`) 유지 — iOS엔
rem 개념이 없고, 웹만 브라우저 폰트 확대(접근성) 대상이라 rem이 필요하다. `tokens/src/*.json`
원본 값은 바꾸지 않는다 — 포맷 함수(`css.mjs`)에서만 `size / 16`으로 렌더링 시점 변환.

`build-web.test.mjs`의 어서션도 새 이름·단위로 갱신한다.

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

- 파일 최상단에 `@import "../styles/tokens.css";` 추가(정확한 상대경로는 실제 파일 위치에
  맞춰 구현 시 확정).
- §3에서 매핑한 카테고리(색·판단색·라운드·타이포·스페이싱·섀도우·모션)의 기존 손 선언을
  제거한다. §4에서 범위 밖으로 남긴 토큰(`--ring` 등)은 그대로 둔다.
- 라이트/다크 두 블록(`:root`와 `@media (prefers-color-scheme: dark)`) 모두 정리 대상.

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

- 가치 색 8종을 `Roam-design`이 TS/JS 산출물로도 내야 할지 — 웹의 `VALUE_TAGS.color`가
  진짜 소스 오브 트루스에서 오게 하려면 필요. 지금은 범위 밖.
- `--primary-foreground` 등 누락 토큰을 `Roam-design`에 추가하는 작업(이전 스펙에서도
  파킹된 항목) — 채워지면 이 레포의 부분 마이그레이션도 마저 정리 가능.
- iOS(`Roam-ios`)가 `Roam-design`을 실제로 소비하도록 RoamKit에 연결하는 작업 — 이
  마이그레이션과 독립적, 별도 진행.
