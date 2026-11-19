import { describe, expect, it } from "vitest";
import { buildComicwBrandsFile, parseBoothMapList, parseBoothcutList } from "./comicw-official";

const row = (code: string, name: string) =>
  `<div class="mgbm-row" data-search="x"><span class="mgbm-num">${code}</span><span class="mgbm-name">${name}</span></div>`;
const MAP = `<h2 id="mgbm-map-title">배치도</h2></div><div class="mgbm-empty">배치도를 준비하고 있습니다.</div>
<span id="mgbm-count">4개 부스</span>${row("BA_01", "퐁시리")}${row("CB_15 CB_16", "별빛다움")}${row("CK_11", "둥굴레 마을")}${row("CK_11", "갸루 클럽")}`;
const card = (id: string, code: string, name: string, spec = "문구C") =>
  `<a class="bc-card" href="/g/${id}"\n       data-spec="${spec}"\n data-mb="x"><div class="bc-booth-num">${code}</div><div class="bc-booth-name">${name}</div></a>`;
const CUTS = `<div class="bc-day-panel" data-day="d0">${card("3528", "CB15", "별빛다움")}${card("3528", "CB16", "별빛다움")}${card("3778", "BA01", "퐁시리", "문구B")}</div>
<div class="bc-day-panel" data-day="d1">${card("3778", "BA01", "퐁시리", "문구B")}</div>`;

describe("comicw 문구전 명단", () => {
  it("확정 부스번호 목록과 배치도 그림 여부를 읽는다", () => {
    const r = parseBoothMapList(MAP);
    expect(r.declaredCount).toBe(4);
    expect(r.mapReady).toBe(false);
    expect(r.entries[1]).toEqual({ codes: ["CB_15", "CB_16"], name: "별빛다움" });
  });

  it("부스컷 요일 패널을 읽는다", () => {
    expect(parseBoothcutList(CUTS)).toHaveLength(4);
  });

  it("brands.v1과 옆 파일(번호, 요일, 나눠 쓰는 번호)을 만든다", () => {
    const { file, booths, duplicates } = buildComicwBrandsFile({
      entries: parseBoothMapList(MAP).entries,
      boothcuts: parseBoothcutList(CUTS),
      exhibitionSlug: "moongu-2026-winter",
      sourceUrl: "https://comicw.net/moongu/booth_map.php?fare_id=36",
      collectedAt: "2026-11-19",
      instagram: new Map([["별빛다움", "https://www.instagram.com/starlight_daum/"]]),
      exhibitorIds: new Map([["별빛다움", "exr_1"]]),
      keyPrefix: "moongu-2026-winter",
      note: "t",
    });
    expect(duplicates).toEqual([]);
    expect(file.brands.map((b) => b.key)).toEqual([
      "moongu-2026-winter-g3778",
      "moongu-2026-winter-g3528",
      expect.stringMatching(/^moongu-2026-winter-ck11-[0-9a-f]{6}$/),
      expect.stringMatching(/^moongu-2026-winter-ck11-[0-9a-f]{6}$/),
    ]);
    expect(new Set(file.brands.map((b) => b.key)).size).toBe(4);
    expect(file.brands[1]).toMatchObject({ exhibitorId: "exr_1", instagramUrl: "https://www.instagram.com/starlight_daum/", participationType: "문구C" });
    expect(booths[0]).toMatchObject({ codes: ["BA01"], days: ["sat", "sun"], spec: "문구B", boothcutUrl: "https://comicw.net/g/3778" });
    expect(booths[1]).toMatchObject({ codes: ["CB15", "CB16"], days: ["sat"] });
    expect(booths[2]).toMatchObject({ codes: ["CK11"], sharesCodeWith: ["갸루 클럽"] });
    expect(booths[2].days).toBeUndefined();
  });

  it("다시 돌려도 열쇠가 같다", () => {
    const run = () =>
      buildComicwBrandsFile({ entries: parseBoothMapList(MAP).entries, boothcuts: [], exhibitionSlug: "s", sourceUrl: "https://x.test", collectedAt: "2026-11-19", keyPrefix: "s", note: "n" }).file.brands.map((b) => b.key);
    expect(run()).toEqual(run());
  });
});
