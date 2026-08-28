# 비주얼 아이덴티티

_확정: 2026-08-15 · 토큰 체계는 이미 `src/app/globals.css`에 구현돼 있다. 이 문서는 그 규칙을 명문화하고, 고쳐야 할 것을 목록화한다._

---

## 1. 로고 · 마크

- **마스터**: `public/logo.svg` — 걷는 R 글리프. 이것이 Roam의 마크이자 로미의 몸이다.
  2026-08-15에 **진짜 벡터로 교체**됐다 (1,045KB 래스터 → 8KB 패스, 원본 대비 IoU 0.983).
  겉모습은 이전과 동일하다. 배경 없는 판본은 `public/mark.svg`.
- **워드마크**: `Roam` (Pretendard, extrabold, `tracking-tight`)
- 마크와 워드마크는 **세로 조합**(마크 위, 워드마크 아래)을 기본으로 한다. 히어로가 그 형태다.
- 마크 프레임: `rounded-[2.5rem]` 소프트 스퀘어. 원형으로 자르지 않는다.
- 로미 모션은 항상 `object-contain`. **잘리지 않는다.**

### 아이콘 배색

**인디고 `#4f46e5` 배경 + 크림 `#FCF9F3` 마크.** `theme_color`와 이어지고, 홈 화면에서 묻히지 않는다.
크림 배경 대안은 `docs/brand/assets/alt/icons-cream/`에 있다.

**maskable은 따로 그린다.** 마크가 중앙 80% 안전원 안에 들어가도록 커버를 46%로 줄인 판본
(`icon-maskable-512.png`). `any` 아이콘(커버 62%)을 그대로 쓰면 Android 어댑티브 마스크에서 잘린다.

**16px에서는 디테일이 뭉갠다.** 마크가 아니라 인디고 타일로 읽힌다 — 의도된 결과다. 24px부터 형태가 산다.

---

## 2. 컬러

### 2-1. 브랜드 · 표면

| 토큰 | 라이트 | 다크 | 용도 |
|---|---|---|---|
| `--primary` | `#4f46e5` | `#818cf8` | 인디고. 브랜드 기본 |
| `--background` | `#ffffff` | `#0b0d10` | |
| `--foreground` | `#14161a` | `#f7f8f9` | |
| `--card` / `--popover` | `#ffffff` | `#16191d` | |
| `--secondary` / `--muted` | `#f2f4f6` | `#1c2024` | |
| `--muted-foreground` | `#6b7684` | `#8b95a1` | |
| `--accent` | `#eef2ff` | `#20204a` | |
| `--border` / `--input` | `#e5e8eb` | `#2a2f36` | |
| `--destructive` | `#f04452` | `#ff6471` | |
| `--success` | `#15c47e` | `#2ad48f` | |
| `--warning` | `#ffb020` | `#ffc24b` | |

중성색은 토스 계열 그레이(`#f2f4f6` `#6b7684` `#333d4b` `#e5e8eb`)다. Tailwind slate가 아니다.

### 2-2. 판단 색 — 이 제품의 고유 체계

| 토큰 | 값 | 뜻 |
|---|---|---|
| `--judge-must` | `var(--primary)` `#4f46e5` | 꼭 갈래 |
| `--judge-curious` | `#8b88ee` | 끌려 |
| `--judge-good` | `#15c47e` | 좋았어 |
| `--judge-ok` | `#7edcb4` | 그냥그랬어 |
| `--judge-bad` | `#d0595d` | 아니었어 |
| `--judge-pass` | `#aab2bf` | 패스 |

**색의 브랜드 원칙 (판단 어휘 문서에서 승격):**

1. **전부 면(fill)으로 나른다.** 테두리·뱃지로 상태를 표현하지 않는다.
2. **약한 긍정을 흐리게 칠하지 않는다.** 누른 상태는 안 누른 상태보다 **명백히 진해야** 한다. "끌려"를 연하게 두면 무반응과 구분이 안 된다.
3. **빨강은 채도를 낮춰 쓴다.** 경고가 아니라 **기록**으로 읽혀야 한다.
4. **"그냥그랬어"는 초록 계열에 둔다.** 무채로 빼면 '패스'와 같은 무리로 묶여, 방문했다는 사실이 색에서 사라진다.
5. **경험한 판정이 화면상의 판단을 이긴다.** 색 = `verdict ?? interest ?? 존 색`.

### 2-3. 가치 색 8종 — 데이터 라벨 전용

`src/lib/values/index.ts`에 따로 있는 팔레트다.

| slug | 라벨 | 색 |
|---|---|---|
| `discovery` | 발견 | `#7c6cff` |
| `experience` | 체험 | `#12b76a` |
| `goods` | 굿즈 | `#f04438` |
| `social` | 소통 | `#0e9384` |
| `learning` | 학습 | `#0ba5ec` |
| `trend` | 트렌드 | `#ee46bc` |
| `inspiration` | 영감 | `#f79009` |
| `rest` | 가볍게 | `#667085` |

**규칙: 가치 색은 데이터 라벨 전용이다.** 브랜드 표면(버튼·헤더·강조)에 쓰지 않는다.
가치를 서로 구별하기 위한 카테고리 스펙트럼이지, 브랜드 팔레트가 아니다.
→ 이 규칙을 지키면 두 팔레트가 충돌하지 않는다. 안 지키면 화면이 무지개가 된다.

### 2-4. 차트
`--chart-1..5` = `#4f46e5` `#15c47e` `#ffb020` `#06b6d4` `#f04452`

---

## 3. 타이포그래피

- **Pretendard Variable** (weight 45–920), `next/font/local`.
- 스케일 (SEED): `xs 12/16 · sm 14/19 · base 16/22 · lg 18/24 · xl 20/27 · 2xl 24/32 · 3xl 28/38`

### 한국어 조판은 브랜드 디테일이다

```css
word-break: keep-all;
overflow-wrap: break-word;
text-wrap: pretty;
```

**단어 중간에서 줄이 끊기지 않는다.** "관심 가는 곳부터"가 "관심 가는 곳부/터"로 깨지면
로미의 말이 시스템 메시지처럼 보인다. 문장이 사람 말로 읽히려면 조판이 먼저다.
줄 끝에 한 단어만 남는 것(orphan)도 피한다.

---

## 4. 형태 · 그림자 · 여백

| 항목 | 값 |
|---|---|
| 기본 라운드 `--radius` | `0.875rem` (14px) — 넉넉하게 |
| 스케일 | `sm 8 · md 12 · lg 14 · xl 20 · 2xl 24` |
| `--shadow-card` | `0 1px 4px rgba(0,0,0,.08)` |
| `--shadow-sheet` | `0 -2px 10px rgba(0,0,0,.10)` |
| `--shadow-pop` | `0 4px 16px rgba(0,0,0,.12)` |

**의미 있는 여백 토큰** (raw 스케일보다 이걸 먼저 쓴다):

| 토큰 | 값 | 자리 |
|---|---|---|
| `--spacing-global-gutter` | 16px | 화면 좌우 기본 여백 |
| `--spacing-component-default` | 12px | |
| `--spacing-nav-to-title` | 20px | |
| `--spacing-screen-bottom` | 56px | |
| `--spacing-between-text` | 6px | |
| `--spacing-between-chips` | 8px | |

---

## 5. 모션

| 토큰 | 값 |
|---|---|
| `--motion-d1..d6` | 50 / 100 / 150 / 200 / 250 / 300ms |
| 이징 | `linear` `functional` `enter` `exit` `enter-expressive` `exit-expressive` |
| 예 | `--motion-ease-enter: cubic-bezier(0,0,.15,1)` |

**로미 모션 = 표정** (`01_romi.md` §7)

| 모션 | 뜻 | 자리 |
|---|---|---|
| `headbunting` | 인사·환영 | 첫 진입, 홈 히어로, 온보딩 인트로 |
| `walk_think` | 생각 중 | 로딩, 큐레이션 대기 |
| `head_spinning` | 놀람·전환 | 예측 빗나감, 새로 고르기 |

로미가 말하지 않는 화면엔 로미를 띄우지 않는다. **장식 금지.**

### 지연 구간에는 무조건 로딩 UX
`loading-messages.ts` + `useRotatingMessage`(2.2초 회전). 빈 스피너만 두지 않는다.
로딩 문구도 로미의 말이다 — `네가 뭘 좋아할지 곰곰이 살펴보는 중이야`

---

## 6. 수정 백로그

| 상태 | 항목 | 결과 |
|---|---|---|
| ✅ | 마크 벡터화 | `logo.svg` 1,045KB → 8KB. `mark.svg`(투명) 추가 |
| ✅ | OG 이미지 | `src/app/opengraph-image.png` · `twitter-image.png` (+ `.alt.txt`) |
| ✅ | 아이콘 세트 | `favicon.ico` · `icon.svg` · `apple-icon.png` · `icon-192/512` · `icon-maskable-512` |
| ✅ | 파비콘 중복 | 스테일 `public/icon.svg`(파랑 삼각형 197B) 제거 → `_to_delete/` |
| ✅ | 보일러플레이트 | `next.svg` `vercel.svg` `file.svg` `globe.svg` `window.svg` → `_to_delete/` |
| 🔲 | 팔레트 이원화 | 가치 색 8종이 `@theme` 밖 — §2-3 규칙을 코드 주석으로 명시 |
| 🔲 | 마스터 영상 | `*_clear.mov` 41MB가 `public/`에 상주, 서빙 안 됨 → 밖으로 이동 |
| 🔲 | 삭제 확정 | `_to_delete/public-boilerplate/` 폴더를 직접 지워야 완료 |
