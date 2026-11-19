import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import {
  entranceMarkers,
  overlaps,
  overlapsBooths,
  wcMarkers,
} from "./map-markers";

/** 390 휴대폰의 지도 띠(검색과 칩 아래, 로미 줄 위)에 세로를 채워 들어왔을 때의 배율. */
const fitAt390 = (fp: { width: number; height: number }) => {
  const bandW = 390;
  const bandH = 600;
  const contain = Math.min(bandW / fp.width, bandH / fp.height) * 0.96;
  return Math.max(contain, (bandH / fp.height) * 0.96);
};

describe("길잡이 표식", () => {
  for (const [slug, fp] of Object.entries(FLOORPLANS)) {
    it(`${slug}: 출입구와 화장실이 부스 칸을 덮지 않는다`, () => {
      const s = fitAt390(fp);
      const ms = [...entranceMarkers(fp, s), ...wcMarkers(fp, s)];
      for (const m of ms)
        expect(overlapsBooths(fp, m), JSON.stringify(m)).toBe(0);
      const ents = entranceMarkers(fp, s);
      ents.forEach((a, i) =>
        ents.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
      );
    });
    it(`${slug}: 출입구 글자는 들어온 배율에서 12px 이상이다`, () => {
      const s = fitAt390(fp);
      for (const m of entranceMarkers(fp, s))
        expect(m.fontSize * s).toBeGreaterThanOrEqual(11.99);
    });
  }
});
