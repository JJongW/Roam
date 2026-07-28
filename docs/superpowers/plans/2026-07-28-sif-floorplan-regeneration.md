# SIF 2026 도면 좌표 재생성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `sif-2026` 전시 지도의 부스 위치·크기를 공식 도면과 정확히 일치시킨다.

**Architecture:** 좌표는 ocreo(공식 플랫폼) 프론트엔드 번들에 인라인 SVG로 박혀 있다. 이걸 일회용 Node 스크립트로 추출해 `src/lib/floorplan-sif.json`을 통째로 재생성한다. 렌더러(`exhibition-map.tsx`)는 손대지 않고, `floorplans.ts`의 `buildSif()`에 있는 좌상단→중심 좌표 변환 누락만 고친다. 운영 DB는 지오메트리를 갖고 있지 않으므로(코드의 `FLOORPLANS`가 이긴다) 캔버스 크기·신규 부스·카테고리 교정만 마이그레이션으로 처리한다.

**Tech Stack:** TypeScript · Node 20 (ESM 스크립트) · vitest · Python 3 + Pillow(시각 대조용) · PostgreSQL(Supabase)

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-07-28-sif-floorplan-regeneration-design.md`. 충돌 시 스펙이 우선.
- 캔버스는 `3028 × 1637`. 부스는 914개. 이 두 값은 스펙에 고정돼 있다.
- `floorplan-sif.json`의 `x/y`는 **좌상단 기준**이다(현행 규약 유지). `FloorplanBooth.x/y`는 **중심 기준**이다. 변환은 `buildSif()`에서만 한다.
- 추출·검증·렌더 스크립트는 **레포에 커밋하지 않는다.** 전부 스크래치패드에서 돌린다. 스크래치패드 경로: `/private/tmp/claude-501/-Users-sinjong-won-ted-urssu-Roam/7d1019dd-0464-43f6-a1c3-a726356bea18/scratchpad`
- `supabase/`는 gitignore다. 마이그레이션 파일은 로컬에만 생기고 git에 안 올라간다. **적용은 사용자가 직접 한다 — 절대 DB에 실행하지 않는다.**
- 주석·커밋 메시지는 한국어. 기존 코드 톤을 따른다.
- 각 태스크 끝에서 반드시 통과해야 하는 검증:
  ```
  npx tsc --noEmit
  npx vitest run
  npx eslint <변경 파일>
  ```

## File Structure

| 파일 | 역할 | 변경 |
|---|---|---|
| `src/lib/floorplan-sif.json` | SIF 도면 원천 데이터 (좌상단 좌표) | 전면 재생성 |
| `src/lib/floorplans.ts` | JSON → `Floorplan`(중심 좌표) 변환 | `buildSif()` 수정 |
| `src/lib/floorplans.test.ts` | 도면 불변식 테스트 (현재 SIBF만) | SIF describe 블록 추가 |
| `src/lib/mock/seed-sif.ts` | floorplan JSON → `Booth[]` | 변경 없음 (JSON을 읽으므로 자동 반영) |
| `supabase/migrations/0026_sif_booth_fixes.sql` | 운영 DB 보정 | 신규 (git 미추적) |

Task 1을 먼저 하는 이유: 좌표 변환을 고친 뒤에 정확한 데이터를 넣어야 중간 상태에서도 지도가 정상이다. 순서를 뒤집으면 Task 1과 2 사이에 부스마다 제각각으로 어긋난 지도가 남는다.

---

### Task 1: `buildSif()` 좌상단 → 중심 좌표 변환

`exhibition-map.tsx`는 `<rect x={-g.w/2} y={-g.h/2}>`를 `translate(g.x, g.y)` 안에 그린다. 즉 `FloorplanBooth.x/y`는 중심이다. 그런데 `buildSif()`는 좌상단 기준인 JSON 값을 변환 없이 넘기고 있다. 지금은 전 부스가 42×40 균일이라 화면 전체가 `(21, 20)`만큼 밀린 것과 같아 눈에 안 띄지만, Task 2에서 크기가 40×40~50×360으로 제각각이 되면 부스마다 다르게 어긋난다.

`buildSibf()`는 이미 중심 기준 JSON을 쓰므로 건드리지 않는다.

**Files:**
- Modify: `src/lib/floorplans.ts` (`buildSif()` — 파일 끝 근처)
- Test: `src/lib/floorplans.test.ts` (`describe("SIF floorplan")` 블록 신규)

**Interfaces:**
- Consumes: `sif` (`@/lib/floorplan-sif.json`) — `{ width, height, booths: [{ code, x, y, w, h, zone, name, cat }] }`, `x/y`는 좌상단.
- Produces: `FLOORPLANS["sif-2026"]` — `Floorplan`. `booths[].x/y`가 중심 좌표.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/floorplans.test.ts` 파일 **맨 끝에** 아래를 덧붙인다. 파일 상단 import 블록에는 두 줄을 추가한다.

> 겹침 불변식 테스트는 여기 없다. 겹침은 데이터의 성질이지 변환 로직의 성질이 아니고, 현재(구) `floorplan-sif.json`에는 실제로 겹치는 부스가 35쌍 있어서 이 시점엔 통과할 수 없다. Task 2에서 정확한 데이터와 함께 추가한다.

```ts
import sifJson from "./floorplan-sif.json";
import { sifBooths } from "./mock/seed-sif";
```

```ts
describe("SIF floorplan", () => {
  const fp = FLOORPLANS["sif-2026"];

  it("converts JSON top-left coords to centre coords", () => {
    const byCode = new Map(sifJson.booths.map((b) => [b.code, b]));
    for (const b of fp.booths) {
      const src = byCode.get(b.code);
      expect(src, `${b.code} missing from JSON`).toBeDefined();
      expect(b.x, `${b.code} x`).toBe(src!.x + src!.w / 2);
      expect(b.y, `${b.code} y`).toBe(src!.y + src!.h / 2);
      expect(b.w, `${b.code} w`).toBe(src!.w);
      expect(b.h, `${b.code} h`).toBe(src!.h);
    }
  });

  it("keeps every booth inside the canvas", () => {
    for (const b of fp.booths) {
      expect(b.x - b.w / 2, `${b.code} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w / 2, `${b.code} right`).toBeLessThanOrEqual(fp.width);
      expect(b.y - b.h / 2, `${b.code} top`).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h / 2, `${b.code} bottom`).toBeLessThanOrEqual(fp.height);
    }
  });

  it("has a rect for every seeded SIF booth", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    for (const b of sifBooths)
      expect(codes.has(b.code!), `missing rect for ${b.code}`).toBe(true);
    expect(fp.booths.length).toBe(sifBooths.length);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npx vitest run src/lib/floorplans.test.ts -t "converts JSON top-left"`

Expected: FAIL. `A01 x: expected 110 to be 131` 같은 메시지 — 현재 `buildSif()`가 좌상단 값을 그대로 넘기기 때문. (같은 파일의 다른 SIF 테스트 3개는 현재 데이터로도 통과한다.)

- [ ] **Step 3: `buildSif()`를 고친다**

`src/lib/floorplans.ts`의 `buildSif()` 전체를 아래로 교체한다. 기존에는 booths를 변환 없이 넘기고 `centers` 배열을 따로 만들어 `bbox`에 넘겼는데, 이제 booths 자체가 중심 좌표이므로 그대로 쓴다.

```ts
// SIF: 격자 부스만 있는 단순 도면(홀/장식 없음). 색은 전부 중립 존색 —
// 지도는 Roam 상태색만 얹으므로 ocreo 색은 쓰지 않는다. 내부 walkable = 부스 bbox.
// JSON 좌표는 좌상단 기준, FloorplanBooth는 중심 기준 → 여기서 변환한다.
// (exhibition-map이 translate(x,y) 안에 rect를 -w/2,-h/2로 그린다.)
function buildSif(): Floorplan {
  const booths: FloorplanBooth[] = sif.booths.map((b) => ({
    code: b.code,
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    w: b.w,
    h: b.h,
    color: ZONE.general,
  }));
  const box = bbox(booths);
  return {
    width: sif.width,
    height: sif.height,
    halls: [],
    decor: [],
    booths,
    interior: [box],
    entrance: { x: sif.width / 2, y: sif.height - 60 },
    exit: { x: sif.width / 2, y: sif.height - 60 },
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `npx vitest run src/lib/floorplans.test.ts`

Expected: PASS. SIBF 5개 + SIF 3개 전부 통과.

- [ ] **Step 5: 전체 검증**

Run:
```
npx tsc --noEmit
npx vitest run
npx eslint src/lib/floorplans.ts src/lib/floorplans.test.ts
```
Expected: 셋 다 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/floorplans.ts src/lib/floorplans.test.ts
git commit -m "fix(map): SIF 도면 좌상단→중심 좌표 변환 누락 수정

exhibition-map은 FloorplanBooth.x/y를 중심으로 그리는데 buildSif가
좌상단 기준 JSON 값을 그대로 넘기고 있었다. 전 부스가 42x40 균일이라
화면 전체가 (21,20) 밀린 것과 같아 묻혀 있었지만, 부스 크기가
제각각이 되면 부스마다 다르게 어긋난다. SIF 도면 불변식 테스트도 추가.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `floorplan-sif.json` 재생성

ocreo 번들에서 정확한 좌표를 추출해 JSON을 통째로 갈아끼운다.

**Files:**
- Modify: `src/lib/floorplan-sif.json` (전면 교체)
- Modify: `src/lib/floorplans.test.ts` (겹침 불변식 테스트 추가 — Step 6)
- 스크래치패드 전용(커밋 안 함): `gen-sif-floorplan.mjs`, `check-sif-floorplan.mjs`, `main.js`

**Interfaces:**
- Consumes: 기존 `src/lib/floorplan-sif.json`의 `code`→`name`/`zone` (조인해 보존), ocreo 번들.
- Produces: `src/lib/floorplan-sif.json` — `{ width: 3028, height: 1637, booths: [{ code, x, y, w, h, zone, name, cat }] }`, 914개, `code` 오름차순. `cat` ∈ `dom-artist` | `dom-biz` | `intl-artist` | `intl-biz` (`seed-sif.ts`의 `CAT_BY_KEY` 키와 동일).

- [ ] **Step 1: ocreo 번들을 내려받는다**

번들 파일명에 콘텐츠 해시가 박혀 있어 URL을 하드코딩할 수 없다. 페이지에서 읽어낸다.

```bash
cd /private/tmp/claude-501/-Users-sinjong-won-ted-urssu-Roam/7d1019dd-0464-43f6-a1c3-a726356bea18/scratchpad
BUNDLE=$(curl -sL "https://www.ocreo.kr/map?fair=sif21" | grep -o '/static/js/main\.[a-f0-9]*\.js')
echo "번들: $BUNDLE"
curl -s "https://www.ocreo.kr$BUNDLE" -o main.js
ls -l main.js
```

Expected: `main.js`가 약 15MB. (작성 시점 기준 `/static/js/main.ed95579d.js`, 15,740,884 바이트.)

- [ ] **Step 2: 추출 스크립트를 쓴다**

`gen-sif-floorplan.mjs`를 스크래치패드에 만든다. 번들 오프셋을 하드코딩하지 않는다 — 번들에 3028×1637 지도 컴포넌트가 3개 있어서, 기존 부스 코드와 가장 많이 겹치는 것을 골라 쓴다(재배포돼도 동작).

```js
// SIF 2026 도면 좌표 재생성 — ocreo 번들에서 추출. 일회용, 커밋하지 않는다.
//   node gen-sif-floorplan.mjs <main.js> <기존 floorplan-sif.json> <출력 경로>
import { readFileSync, writeFileSync } from "node:fs";

const [bundlePath, currentPath, outPath] = process.argv.slice(2);
const src = readFileSync(bundlePath, "latin1");
const current = JSON.parse(readFileSync(currentPath, "utf8"));

// ocreo 채우기 색 → 우리 cat 키. 이 4색이 sif21 컴포넌트의 지문이기도 하다.
const FILL_TO_CAT = {
  "#CFEEFF": "dom-artist",
  "#FFDFAB": "dom-biz",
  "#DCDDFF": "intl-artist",
  "#C6ECDF": "intl-biz",
};

// <g id="A01"><rect ... x y width height rx=3 fill="#CFEEFF" ...>
// 일부 g는 clipPath를 갖고, 일부는 fill 없는 아웃라인 rect가 먼저 온다 →
// g 뒤 600자 안에서 fill 있는 첫 rect를 취한다.
const G_RE = /"g",\{id:"([^"]{1,40})"(?:,clipPath:"[^"]*")?\}/g;
const RECT_RE =
  /"rect",\{(?:id:"[^"]*",)?x:(-?[\d.]+),y:(-?[\d.]+),width:(-?[\d.]+),height:(-?[\d.]+)(?:,rx:([\d.]+))?(?:,fill:"([^"]+)")?/g;

function componentStarts() {
  const starts = [];
  const re = /viewBox:"0 0 3028 1637"/g;
  let m;
  while ((m = re.exec(src))) starts.push(m.index);
  return starts;
}

function parseComponent(lo, hi) {
  const seg = src.slice(lo, hi);
  const booths = new Map();
  G_RE.lastIndex = 0;
  let g;
  while ((g = G_RE.exec(seg))) {
    const window = seg.slice(G_RE.lastIndex, G_RE.lastIndex + 600);
    RECT_RE.lastIndex = 0;
    let r;
    while ((r = RECT_RE.exec(window))) {
      if (!r[6]) continue; // 아웃라인 rect(fill 없음) 건너뛰기
      if (!booths.has(g[1]))
        booths.set(g[1], { x: +r[1], y: +r[2], w: +r[3], h: +r[4], fill: r[6] });
      break;
    }
  }
  return booths;
}

const currentCodes = new Set(current.booths.map((b) => b.code));
const starts = componentStarts();
if (starts.length === 0) throw new Error("3028x1637 지도 컴포넌트를 못 찾음");
const bounds = [...starts, src.length];
let best = null;
for (let i = 0; i < starts.length; i++) {
  const booths = parseComponent(bounds[i], bounds[i + 1]);
  let overlap = 0;
  for (const code of booths.keys()) if (currentCodes.has(code)) overlap++;
  console.error(
    `컴포넌트 @${starts[i]}: g=${booths.size} 코드일치=${overlap}/${currentCodes.size}`,
  );
  if (!best || overlap > best.overlap) best = { overlap, booths, at: starts[i] };
}
console.error(`선택: @${best.at} (일치 ${best.overlap})`);

const missing = [...currentCodes].filter((c) => !best.booths.has(c));
if (missing.length > 0)
  throw new Error(`선택된 컴포넌트에 기존 부스가 없음: ${missing.join(", ")}`);

// 기존 name/zone을 코드로 조인해 보존. cat은 ocreo 색을 진실로 삼는다.
const byCode = new Map(current.booths.map((b) => [b.code, b]));
// 도면에만 있고 기존 데이터에 없는 부스 — 도면 라벨에서 읽은 이름.
const NEW_NAMES = { O08: "Illustration Taipei" };

const booths = [...best.booths.entries()]
  .map(([code, r]) => {
    const cat = FILL_TO_CAT[r.fill];
    if (!cat) throw new Error(`${code}: 모르는 채우기 색 ${r.fill}`);
    const prev = byCode.get(code);
    const name = prev?.name ?? NEW_NAMES[code];
    if (!name) throw new Error(`${code}: 이름 없음 — NEW_NAMES에 추가 필요`);
    return {
      code,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      zone: prev?.zone ?? "general",
      name,
      cat,
    };
  })
  .sort((a, b) => a.code.localeCompare(b.code));

writeFileSync(outPath, JSON.stringify({ width: 3028, height: 1637, booths }) + "\n");
console.error(`작성: ${outPath} — 부스 ${booths.length}개`);
```

- [ ] **Step 3: 검증 스크립트를 쓴다**

`check-sif-floorplan.mjs`를 스크래치패드에 만든다. 커밋할 JSON이 아니라 생성 결과를 게이트하는 용도다.

```js
// 재생성된 floorplan-sif.json 불변식 검증. 일회용, 커밋하지 않는다.
//   node check-sif-floorplan.mjs <floorplan-sif.json>
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const fp = JSON.parse(readFileSync(process.argv[2], "utf8"));
const b = fp.booths;

assert.equal(fp.width, 3028, "캔버스 폭");
assert.equal(fp.height, 1637, "캔버스 높이");
assert.equal(b.length, 914, "부스 수");
assert.equal(new Set(b.map((x) => x.code)).size, 914, "부스 코드 유일");

for (const x of b) {
  assert.ok(x.name && x.name.length > 0, `${x.code}: 이름 비어 있음`);
  assert.ok(x.w > 0 && x.h > 0, `${x.code}: 크기 0 이하`);
  assert.ok(
    x.x >= 0 && x.y >= 0 && x.x + x.w <= fp.width && x.y + x.h <= fp.height,
    `${x.code}: 캔버스 이탈 (${x.x},${x.y},${x.w},${x.h})`,
  );
}

// 좌표는 좌상단 기준. 변끼리 맞닿는 건 겹침이 아니다.
let overlaps = 0;
for (let i = 0; i < b.length; i++)
  for (let j = i + 1; j < b.length; j++) {
    const a = b[i];
    const c = b[j];
    if (a.x < c.x + c.w && c.x < a.x + a.w && a.y < c.y + c.h && c.y < a.y + a.h) {
      overlaps++;
      if (overlaps <= 5) console.error(`겹침: ${a.code} × ${c.code}`);
    }
  }
assert.equal(overlaps, 0, "부스 겹침");

const sizes = new Set(b.map((x) => `${x.w}x${x.h}`));
assert.ok(sizes.size >= 19, `크기 종류 ${sizes.size} — 19 이상이어야 함`);

const cats = {};
for (const x of b) cats[x.cat] = (cats[x.cat] ?? 0) + 1;
assert.deepEqual(
  cats,
  { "dom-artist": 718, "dom-biz": 124, "intl-artist": 67, "intl-biz": 5 },
  "카테고리 분포",
);

console.log(
  `OK — 부스 ${b.length}개, 크기 ${sizes.size}종, 겹침 0, 캔버스 ${fp.width}x${fp.height}`,
);
```

- [ ] **Step 4: 생성하고 검증한다 (레포에는 아직 안 쓴다)**

```bash
cd /private/tmp/claude-501/-Users-sinjong-won-ted-urssu-Roam/7d1019dd-0464-43f6-a1c3-a726356bea18/scratchpad
node gen-sif-floorplan.mjs main.js \
  /Users/sinjong-won/ted.urssu/Roam/src/lib/floorplan-sif.json \
  new-floorplan-sif.json
node check-sif-floorplan.mjs new-floorplan-sif.json
```

Expected (stderr에 컴포넌트 3개 스캔 로그, 이어서):
```
컴포넌트 @1607932: g=949 코드일치=817/913
컴포넌트 @4540472: g=914 코드일치=913/913
컴포넌트 @7453442: g=894 코드일치=765/913
선택: @4540472 (일치 913)
작성: new-floorplan-sif.json — 부스 914개
OK — 부스 914개, 크기 19종, 겹침 0, 캔버스 3028x1637
```
오프셋 숫자는 번들 재배포 시 달라질 수 있다. **"일치=913/913"인 컴포넌트가 정확히 하나 선택되고 마지막 `OK` 줄이 나오는 것**이 통과 조건이다. 어느 컴포넌트도 913/913이 아니면 중단하고 보고한다 — ocreo가 도면을 갱신했다는 뜻이다.

- [ ] **Step 5: 레포에 반영한다**

```bash
cp /private/tmp/claude-501/-Users-sinjong-won-ted-urssu-Roam/7d1019dd-0464-43f6-a1c3-a726356bea18/scratchpad/new-floorplan-sif.json \
   /Users/sinjong-won/ted.urssu/Roam/src/lib/floorplan-sif.json
cd /Users/sinjong-won/ted.urssu/Roam
node -e "
const f=require('./src/lib/floorplan-sif.json');
const s={};for(const b of f.booths)s[b.w+'x'+b.h]=(s[b.w+'x'+b.h]||0)+1;
console.log('캔버스',f.width+'x'+f.height,'부스',f.booths.length,'크기종류',Object.keys(s).length);
console.log('O08',JSON.stringify(f.booths.find(b=>b.code==='O08')));
for(const c of ['J42','J49','R14'])console.log(c,f.booths.find(b=>b.code===c).cat);
"
```

Expected:
```
캔버스 3028x1637 부스 914 크기종류 19
O08 {"code":"O08","x":1890,"y":1147,"w":40,"h":40,"zone":"general","name":"Illustration Taipei","cat":"intl-biz"}
J42 intl-artist
J49 intl-artist
R14 intl-artist
```

- [ ] **Step 6: 겹침 불변식 테스트를 추가한다**

겹침은 데이터의 성질이라 정확한 데이터가 들어온 지금 추가한다(Task 1에서는 구 데이터에 실제 겹침이 35쌍 있어 통과할 수 없었다). `src/lib/floorplans.test.ts`의 `describe("SIF floorplan")` 블록 안, `keeps every booth inside the canvas` 다음에 넣는다.

```ts
  it("never overlaps two booth rectangles", () => {
    // 914개 → 417k 쌍. 쌍마다 expect()를 부르면 느리므로 실패만 모아 한 번 단언한다.
    const r = fp.booths.map((b) => ({
      code: b.code,
      l: b.x - b.w / 2,
      rt: b.x + b.w / 2,
      t: b.y - b.h / 2,
      bt: b.y + b.h / 2,
    }));
    const bad: string[] = [];
    for (let i = 0; i < r.length; i++) {
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i];
        const b = r[j];
        // 변이 맞닿는 건(≤2px) 정상. 진짜 겹칠 때만 실패.
        const ox = Math.min(a.rt, b.rt) - Math.max(a.l, b.l);
        const oy = Math.min(a.bt, b.bt) - Math.max(a.t, b.t);
        if (ox > 2 && oy > 2) bad.push(`${a.code}×${b.code}`);
      }
    }
    expect(bad).toEqual([]);
  });
```

이 테스트를 **구 데이터에서 먼저 돌려 RED를 확인할 필요는 없다** — Task 1 실행 중 실제로 35쌍 실패하는 것이 이미 확인됐다(`H27×V44` 등). 새 데이터에서 통과하는 것만 확인한다.

- [ ] **Step 7: 전체 검증**

Run:
```
npx vitest run src/lib/floorplans.test.ts
npx tsc --noEmit
npx vitest run
npx eslint src/lib/floorplans.test.ts
```
Expected: 전부 PASS. SIBF 5개 + SIF 4개. `has a rect for every seeded SIF booth`도 통과해야 한다 — `seed-sif.ts`가 같은 JSON을 읽으므로 914개로 함께 늘어난다.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/floorplan-sif.json src/lib/floorplans.test.ts
git commit -m "fix(map): SIF 도면 좌표를 공식 도면과 일치시킴

기존 데이터는 913개 부스가 42x40·52x46 두 크기로만 되어 있고 공식 도면
대비 위치가 중앙값 343px 어긋났다(정확히 맞는 부스 0개). ocreo 번들의
sif21 지도 SVG에서 정확한 x/y/w/h를 이식한다.

- 캔버스 2584x1506 → 3028x1637
- 부스 크기 2종 → 19종(40x40 ~ 50x360), 빈 공간이 실제 도면대로 남음
- O08(Illustration Taipei) 추가 → 914개
- J42·J49·R14 카테고리를 해외작가로 교정(ocreo 도면 색 기준)

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: 공식 도면과 시각 대조 + 앱 실행 확인

단위 테스트는 "겹치지 않는다"까지만 보장한다. 배치가 실제 도면과 같은지는 눈으로 봐야 한다.

**Files:**
- 스크래치패드 전용(커밋 안 함): `render-sif.py`, `render-new.png`
- 참조: `public/fair-map.jpg` (공식 도면, 6056×3274 = 도면 좌표계의 정확히 2배)

**Interfaces:**
- Consumes: `src/lib/floorplan-sif.json` (Task 2 산출물)
- Produces: 없음 (검증 전용 태스크, 코드 변경 없음)

- [ ] **Step 1: 렌더 스크립트를 쓴다**

`render-sif.py`를 스크래치패드에 만든다. Pillow는 설치돼 있다(11.3.0).

```python
# floorplan-sif.json을 PNG로 렌더해 공식 도면과 눈으로 대조한다. 일회용.
#   python3 render-sif.py <floorplan-sif.json> <출력.png>
import json, sys
from PIL import Image, ImageDraw

fp = json.load(open(sys.argv[1]))
S = 2  # 공식 jpg(6056x3274)와 같은 배율
im = Image.new("RGB", (int(fp["width"] * S), int(fp["height"] * S)), "white")
d = ImageDraw.Draw(im)
CAT = {"dom-artist": "#CFEEFF", "dom-biz": "#FFDFAB",
       "intl-artist": "#DCDDFF", "intl-biz": "#C6ECDF"}
for b in fp["booths"]:
    d.rounded_rectangle(
        [b["x"] * S, b["y"] * S, (b["x"] + b["w"]) * S, (b["y"] + b["h"]) * S],
        radius=6, fill=CAT[b["cat"]], outline="white", width=2)
im.save(sys.argv[2])
print("wrote", sys.argv[2], im.size)
```

- [ ] **Step 2: 렌더해서 도면과 나란히 본다**

```bash
cd /private/tmp/claude-501/-Users-sinjong-won-ted-urssu-Roam/7d1019dd-0464-43f6-a1c3-a726356bea18/scratchpad
python3 render-sif.py /Users/sinjong-won/ted.urssu/Roam/src/lib/floorplan-sif.json render-new.png
python3 -c "
from PIL import Image
Image.open('render-new.png').resize((2000,1081), Image.LANCZOS).save('render-new-small.png')
Image.open('/Users/sinjong-won/ted.urssu/Roam/public/fair-map.jpg').resize((2000,1081), Image.LANCZOS).save('official-small.png')
"
```

Read 도구로 `render-new-small.png`와 `official-small.png`를 둘 다 열어 비교한다. 확인 항목:

- 세로 부스 열의 개수와 좌우 간격이 같은가
- 상단 가로 띠(V30~V54 주황 열)의 위치·길이가 같은가
- 우측 대형 블록(S·T·U·V 주황 구역)의 크기와 배치가 같은가
- 좌하단 A열 세로 스트립이 같은 자리에 있는가
- 기둥 자리(도면의 회색 원 칸)가 빈 공간으로 남아 있는가

**차이가 나도 되는 것(범위 밖, 정상):** 좌상단 CAFE·"마음의 밀도, 채우다" 블록, 우측 CAFE, 하단 출입구 GATE, 화장실·입구 아이콘, 외곽 벽선. 렌더에는 없다.

- [ ] **Step 3: mock 모드로 앱을 띄워 확인한다**

```bash
cd /Users/sinjong-won/ted.urssu/Roam
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev
```

`sif-2026` 전시의 지도 화면에서 확인:
- 부스 크기가 제각각으로 보이는가(균일 격자가 아닌가)
- 도면 오른쪽 끝(V01~V16 세로 열)까지 잘리지 않고 보이는가
- 부스를 눌렀을 때 선택 테두리가 그 부스에 정확히 맞는가(중심 좌표 변환 확인)
- `O08 Illustration Taipei`가 지도에 있고 눌러서 상세가 열리는가

- [ ] **Step 4: 커밋 없음**

이 태스크는 코드를 바꾸지 않는다. 검증 결과만 보고한다. 불일치를 발견하면 커밋하지 말고 어느 항목이 어떻게 다른지 보고한다.

---

### Task 4: 운영 DB 마이그레이션 SQL 작성

**지오메트리는 마이그레이션이 필요 없다.** `exhibition-map.tsx`의 `geomOf()`가 부스 `code`로 `FLOORPLANS`를 먼저 조회하고, 찾으면 DB의 `booth.x/y`를 안 쓴다. 좌표 수정은 배포만으로 반영된다.

DB 행이 필요한 건 세 가지다:

1. **캔버스 크기 — 필수.** `map-view.tsx:159`가 floorplan이 아니라 `exhibition.mapWidth/mapHeight`를 `ExhibitionMap`의 캔버스로 넘긴다. 운영 값은 옛 `2584 × 1506`이라, 안 고치면 부스는 x=2918까지 뻗는데 뷰포트가 2584에서 끊겨 **도면 오른쪽(S·T·U·V 블록)이 잘린다.** mock은 `seed-sif.ts`가 `sifFloor.width/height`를 읽어 자동 반영되므로 Task 3에서 안 드러난다.
2. **`O08` 부스 INSERT.** 운영에서는 부스 목록이 DB에서 오고, floorplan에만 있는 코드는 렌더 대상에서 빠진다.
3. **카테고리 교정 3건** — `J42`·`J49`·`R14`를 해외작가로.

**Files:**
- Create: `supabase/migrations/0026_sif_booth_fixes.sql` (git 미추적 — `supabase/`는 gitignore)

**Interfaces:**
- Consumes: 테이블 `exhibition`(`slug`, `map_width`, `map_height`) · `hall`(`exhibition_id`) · `category`(`slug`, `name` — 전시 무관 전역) · `booth`(컬럼은 `src/lib/supabase/repository.ts:225`의 `BOOTH_LIST_COLS` 참조).
- Produces: 없음 (앱 코드가 이 마이그레이션을 import하지 않는다).

- [ ] **Step 1: 마이그레이션 파일을 쓴다**

`supabase/migrations/0026_sif_booth_fixes.sql`을 만든다. 파일 번호는 기존 최대(`0025_bookmark_owned_by_user.sql`) 다음이다. 하드코딩된 id 대신 `slug`/`code`로 조회해서, 운영 DB의 실제 id 값과 무관하게 동작하게 한다. 전부 멱등이다.

```sql
-- 0026_sif_booth_fixes.sql
-- SIF 2026 도면 좌표 재생성(docs/superpowers/specs/2026-07-28-sif-floorplan-regeneration-design.md)
-- 에 따른 운영 DB 보정. 부스 지오메트리는 코드의 FLOORPLANS가 이기므로 여기 없다.
-- 멱등 — 여러 번 실행해도 같은 결과.

-- 1) 캔버스 크기. map-view.tsx가 exhibition.map_width/height를 지도 뷰포트로 쓴다.
--    옛 2584x1506이면 도면 오른쪽(S·T·U·V 블록)이 잘린다.
update exhibition
set map_width = 3028,
    map_height = 1637
where slug = 'sif-2026';

-- 2) O08 (Illustration Taipei, 해외 기업) 추가. 공식 도면엔 있는데 참가자
--    목록 이관 때 누락됐다. DB에 행이 없으면 지도에 그려지지 않는다.
insert into booth (
  id, exhibition_id, hall_id, category_id, code, kind, name, company,
  description, long_description, images, tags, x, y, popularity, created_at
)
select
  'sif_o08',
  e.id,
  (select h.id from hall h where h.exhibition_id = e.id order by h.sort limit 1),
  c.id,
  'O08',
  'exhibitor',
  'Illustration Taipei',
  c.name,
  'Illustration Taipei · 부스 O08',
  'Illustration Taipei의 부스입니다. 부스 번호 O08. 2026 서울일러스트레이션페어 참가 해외 기업입니다.',
  '{}'::text[],
  array['intl-biz']::text[],
  1890,
  1147,
  50,
  '2026-01-05T00:00:00.000Z'::timestamptz
from exhibition e
cross join category c
where e.slug = 'sif-2026'
  and c.slug = 'intl-biz'
on conflict (id) do update set
  category_id = excluded.category_id,
  company     = excluded.company,
  tags        = excluded.tags,
  x           = excluded.x,
  y           = excluded.y;

-- 3) 카테고리 교정 3건. ocreo 도면은 해외작가(#DCDDFF)로 칠했는데 우리 데이터엔
--    국내작가로 들어가 있었다. tags는 read 시 valueTags 도출에 쓰이므로 함께 고친다.
update booth b
set category_id = c.id,
    company     = c.name,
    tags        = array['intl-artist']::text[]
from category c, exhibition e
where c.slug = 'intl-artist'
  and e.slug = 'sif-2026'
  and b.exhibition_id = e.id
  and b.code in ('J42', 'J49', 'R14');
```

- [ ] **Step 2: 문법을 확인한다 (DB에 실행하지 않는다)**

이 환경에는 운영 DB 접속이 없다. **절대 실행하지 않는다.** 대신 SQL을 다시 읽고 확인한다:

- `booth` 컬럼명이 `src/lib/supabase/repository.ts:225`의 `BOOTH_LIST_COLS` 및 `mapBooth`와 일치하는가 (`long_description`은 `BOOTH_LIST_COLS`에 없지만 `mapBooth`가 읽으므로 테이블에는 있다)
- `hall` 서브쿼리에 `limit 1`이 있어 홀이 여러 개여도 행이 곱해지지 않는가
- 세 문장 모두 재실행해도 안전한가

- [ ] **Step 3: 커밋 시도 후 미추적을 확인한다**

`supabase/`는 gitignore이므로 이 파일은 git에 안 올라간다. 정상이다.

```bash
cd /Users/sinjong-won/ted.urssu/Roam
git status --short supabase/ ; git check-ignore -v supabase/migrations/0026_sif_booth_fixes.sql
```
Expected: `git status`는 아무것도 출력하지 않고, `check-ignore`가 `.gitignore` 규칙을 출력한다.

- [ ] **Step 4: 사용자에게 인계한다**

마이그레이션은 **사용자가 직접 적용한다.** 아래를 보고한다:
- 파일 경로: `supabase/migrations/0026_sif_booth_fixes.sql`
- 적용 안 하면 생기는 일: 운영 지도의 오른쪽 S·T·U·V 블록이 잘리고, O08이 안 보이고, J42·J49·R14가 국내작가로 표시된다
- 적용 후 확인: 운영에서 SIF 지도를 열어 오른쪽 끝까지 보이는지, O08이 있는지

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 태스크 |
|---|---|
| ocreo 번들에서 좌표 추출, jpg는 검증용만 | Task 2 Step 1~4 |
| 추출 스크립트 커밋 안 함 | Global Constraints + Task 2 (스크래치패드) |
| 캔버스 3028×1637 | Task 2 Step 3 assert |
| 부스 914개, O08 추가, name/zone 보존 | Task 2 Step 2 (`NEW_NAMES`, 조인) |
| cat 3건 ocreo 기준 교정 | Task 2 Step 2 (`FILL_TO_CAT`), Step 5 확인 |
| 빈칸은 별도 엔티티 없이 자연 공백 | Task 2 (도면에 없는 자리는 부스도 없음), Task 3 Step 2 확인 항목 |
| `buildSif()` 좌상단→중심 변환 | Task 1 |
| `entrance`/`exit` 현행 유지 | Task 1 Step 3 코드에 그대로 |
| DB: 캔버스·O08·카테고리 3건 | Task 4 |
| 지오메트리는 마이그레이션 불필요 | Task 4 서두 |
| decor(CAFE·GATE·화장실·벽) 범위 밖 | Task 1 Step 3(`decor: []`), Task 3 Step 2 "차이가 나도 되는 것" |
| 검증: 시각 대조·불변식·tsc/vitest/eslint·mock 실행 | Task 3, Task 2 Step 3·6, 각 태스크 말미 |

빠진 요구 없음.

**플레이스홀더 스캔:** 없음. 모든 코드 단계에 실제 코드가 들어 있고, 모든 실행 단계에 기대 출력이 있다. O08 이름은 공식 도면 라벨에서 읽어 확정했다(`Illustration Taipei`).

**타입 일관성:** `cat` 값 4종은 `seed-sif.ts`의 `CAT_BY_KEY` 키(`dom-artist`/`dom-biz`/`intl-artist`/`intl-biz`)와 일치. Task 1 테스트의 `sifJson`·`sifBooths` import 이름이 Task 1 안에서만 쓰이고 일관됨. `FloorplanBooth` 필드(`code/x/y/w/h/color`)는 `floorplans.ts` 기존 인터페이스 그대로. 마이그레이션 컬럼명은 `repository.ts`의 `mapBooth`/`mapCategory` 매핑과 대조 완료.
