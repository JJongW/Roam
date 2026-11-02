/**
 * 부스 겹침을 데이터에서 걷어낸다.
 *
 * 주최 도면에는 겹치는 부스가 없다 — 한 칸을 두 곳에 팔 수는 없으니까. 그래서
 * 우리 도면의 겹침은 전시의 사실이 아니라 **좌표를 옮기는 과정에서 생긴 오차**다.
 *
 * 무엇을 깎는가: 추정 도면에서 가장 믿을 수 있는 숫자는 **중심**이다(부스 이름이
 * 거기 적혀 있어서 그 점을 보고 찍었다). 가장 못 믿는 건 **크기**다(경계선을
 * 어디로 봤는지가 사람마다 다르다). 그래서 중심을 고정하고 크기만 줄인다 —
 * 부스를 옮기면 "A 옆이 B"라는 도면의 사실이 깨지는데, 조금 작게 그리는 건
 * 아무 사실도 깨지 않는다.
 *
 * **겹친 축으로만** 깎는다. 등비로 줄이면 세로로 20 겹친 60×500 부스가 가로로도
 * 10 깎여서, 고치려던 오차보다 고친 자리가 더 커진다.
 *
 * 실행: npx vite-node -c worker/vite.config.ts scripts/deoverlap-floorplan.ts <json 경로…>
 *
 * ⚠️ **도면을 다시 생성하면 다시 돌려야 한다.** `floorplan-from-sdw.mjs` 같은
 * 생성기는 공식 사이트 좌표를 그대로 옮기므로 겹침이 되살아난다. 잊어도
 * `floorplans.test.ts`의 겹침 0 검사가 막는다 — 그 테스트가 이 스크립트의 알람이다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { findBoothOverlaps } from "@/lib/floorplan/overlap";
import type { FloorplanBooth } from "@/lib/floorplans";

/** 부스 사이에 남겨둘 최소 틈(도면 단위). 0 으로 맞추면 반올림 한 번에 다시 겹친다. */
const CLEARANCE = 1;
/** 한 변을 원래의 이만큼 아래로는 줄이지 않는다. 여기까지 줄여도 안 떨어지면 크기
 *  오차가 아니라 **좌표가 틀린 것**이므로, 조용히 찌그러뜨리지 말고 알린다. */
const MIN_SCALE = 0.75;

const round = (n: number) => Math.round(n * 10) / 10;

for (const path of process.argv.slice(2)) {
  const raw = readFileSync(path, "utf8");
  const plan = JSON.parse(raw) as { booths: FloorplanBooth[] };
  const before = findBoothOverlaps(plan.booths).length;
  let rounds = 0;
  while (rounds++ < 12) {
    const ov = findBoothOverlaps(plan.booths);
    if (!ov.length) break;
    // 겹친 쌍의 **양쪽을** 절반씩 줄인다. 한쪽만 깎으려면 어느 쪽을 깎을지 기준이
    // 필요하고, 그 기준은 결국 "파일에 먼저 나온 부스"가 된다 — 임의다.
    const needW = new Map<string, number>();
    const needH = new Map<string, number>();
    for (const o of ov) {
      const half = o.depth / 2 + CLEARANCE / 2;
      for (const code of [o.a, o.b]) {
        const b = plan.booths.find((x) => x.code === code)!;
        // 겹친 방향을 부스 **자기 축**으로 옮긴다 — 비스듬히 선 부스는 세로로
        // 겹쳐 보여도 그 부스 입장에선 제 폭이 겹친 것일 수 있다.
        const a = ((b.rotate ?? 0) * Math.PI) / 180;
        const along = Math.abs(o.axis[0] * Math.cos(a) + o.axis[1] * Math.sin(a));
        const map = along >= 0.5 ? needW : needH; // 자기 w 축에 가까우면 폭을 깎는다
        map.set(code, Math.max(map.get(code) ?? 0, half));
      }
    }
    plan.booths = plan.booths.map((b) => {
      const dw = needW.get(b.code) ?? 0;
      const dh = needH.get(b.code) ?? 0;
      if (!dw && !dh) return b;
      return {
        ...b,
        w: round(Math.max(b.w * MIN_SCALE, b.w - dw)),
        h: round(Math.max(b.h * MIN_SCALE, b.h - dh)),
      };
    });
  }
  const after = findBoothOverlaps(plan.booths);
  // 들여쓰기 1칸 + 끝 개행 없음 = 생성기(`floorplan-from-sdw.mjs`)와 같은 모양.
  // 다르게 쓰면 한 부스를 고친 커밋이 파일 전체를 다시 쓴 것으로 보인다.
  writeFileSync(path, JSON.stringify(plan, null, 1) + (raw.endsWith("\n") ? "\n" : ""));
  console.log(`${path}: 겹침 ${before} → ${after.length}쌍 (${rounds - 1}회)`);
  for (const o of after) console.log(`  남음 ${o.a}×${o.b} ${o.depth.toFixed(1)} — 좌표를 다시 봐야 한다`);
}
