/**
 * `FLOORPLANS` 를 iOS 번들이 읽는 JSON 으로 떠낸다.
 *
 * iOS 는 배치도를 API 로 받지 않고 **번들한다**(Roam-ios `BundledFloorplanRepository`).
 * 처음엔 `build*()`/`compose()` 를 한 번 손으로 실행해 결과를 복사해 넣었는데, 그 뒤
 * 전시가 다섯 개 늘어나는 동안 아무도 다시 뜨지 않아서 **iOS 는 2026-09-02 의 도면
 * 세 개에 멈춰 있었다** — 오늘 열리는 전시를 포함해 다섯 전시가 앱에서 부스 목록으로만
 * 보였다. 손으로 하는 단계가 하나 있으면 그 단계는 결국 빠진다.
 *
 *   npx vite-node -c vitest.config.ts scripts/dump-floorplans.ts \
 *     ../Roam-ios/Roam/RoamKit/Sources/RoamKit/Resources/Floorplans
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FLOORPLANS } from "@/lib/floorplans";

const outDir = process.argv[2];
if (!outDir) {
  console.error("출력 폴더를 인자로 받는다 (예: ../Roam-ios/.../Resources/Floorplans)");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

type Gate = { label: string; kind: string };

for (const [slug, plan] of Object.entries(FLOORPLANS)) {
  // iOS `Floorplan` 이 읽는 필드만 쓴다. venue 원본·source 메모까지 넣으면 앱 번들만
  // 커지고 디코더는 무시한다.
  //
  // `gates` 는 **이름이 붙은 출입구**다("A홀 입구"). `decor` 의 entrance 는 그리기용이라
  // 전시마다 있을 때도 없을 때도 있다 — exporum 에서 변환한 도면(카페쇼·DDP·가구쇼)은
  // venue 합성을 안 거쳐서 decor 가 비고 gates 만 남는다. "지금 어디쯤이야"의 선택지는
  // 이름으로 만들어지므로 둘 다 넘긴다.
  const { width, height, halls = [], decor = [], booths, gates = [] } =
    plan as unknown as {
      width: number; height: number;
      halls?: unknown[]; decor?: unknown[]; booths: unknown[]; gates?: Gate[];
    };
  // **`backdrop` 은 보내지 않는다.** 주최 측이 스캔한 도면 그림을 바닥에 까는 건
  // 전시마다 남의 그림을 쓰는 것이고, "틀 하나에 전시 데이터를 부어 찍어낸다"는
  // 이 제품의 구조가 거기서 깨진다. 우리 도면은 좌표·홀·출입구에서 **우리가** 그린다.
  //
  // `interior` 도 뺀다 — 웹에서도 그리는 데가 아니라 길찾기에 쓰는 벽 영역이고,
  // iOS 엔 길찾기가 없다.
  writeFileSync(
    join(outDir, `floorplan-${slug}.json`),
    JSON.stringify({ width, height, halls, decor, booths, gates }) + "\n",
  );
  const 입구 = gates.filter((g) => g.kind === "in").map((g) => g.label);
  console.log(
    `${slug.padEnd(28)} 부스 ${String(booths.length).padStart(4)} · 홀 ${halls.length} · 입구 ${JSON.stringify(입구)}`,
  );
}
