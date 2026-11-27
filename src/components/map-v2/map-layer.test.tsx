import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MapLayerV2 } from "./map-layer";
import type { MapLayerContext, MapRect } from "@/components/map/exhibition-map";
import type { BoothListItem } from "@/lib/types";

/**
 * 다녀온 칸 = 초록 면(UI 26-F4, 2026-11-27 Ted). 체크 아이콘과 테두리는 쓰지 않고, 하트는 숨기지 않는다.
 * Roam-design docs/decisions/2026-11-27_지도-다녀온-칸-초록-면-발자국.md
 */

const C = (name: string) => `var(--roam-v2-color-${name})`;

const booth = (id: string, name: string, kind: "exhibitor" | "facility" = "exhibitor") =>
  ({ id, name, code: id.toUpperCase(), kind, tags: [] }) as unknown as BoothListItem;

const booths = [
  booth("a", "보통 칸"),
  booth("b", "하트 칸"),
  booth("c", "다녀온 칸"),
  booth("d", "하트와 다녀온 칸"),
  booth("e", "고른 다녀온 칸"),
  booth("f", "작은 칸"),
];
const geoms: Record<string, MapRect> = {
  a: { x: 100, y: 100, w: 120, h: 80 },
  b: { x: 300, y: 100, w: 120, h: 80 },
  c: { x: 500, y: 100, w: 120, h: 80 },
  d: { x: 700, y: 100, w: 120, h: 80 },
  e: { x: 900, y: 100, w: 120, h: 80 },
  f: { x: 1100, y: 100, w: 30, h: 20 },
} as unknown as Record<string, MapRect>;

const ctx = (selectedId: string | null = null): MapLayerContext => ({
  width: 1200,
  height: 300,
  booths,
  geomOf: (b) => geoms[b.id] ?? null,
  hallRegions: [],
  labelQuarter: 0,
  selectedId,
  fitScale: 1,
});

function drawMap({
  heart = [],
  visited = [],
  highlight = null,
  selectedId = null,
}: {
  heart?: string[];
  visited?: string[];
  highlight?: string[] | null;
  selectedId?: string | null;
}) {
  return render(
    <svg>
      <MapLayerV2
        ctx={ctx(selectedId)}
        heartIds={new Set(heart)}
        visitedIds={new Set(visited)}
        highlightIds={highlight ? new Set(highlight) : null}
      />
    </svg>,
  );
}

/** 칸 하나의 그룹(엔진 translate로 찾는다). */
function cell(container: HTMLElement, id: string) {
  const g = geoms[id];
  const el = container.querySelector(`g[transform="translate(${g.x} ${g.y})"]`);
  if (!el) throw new Error(`칸 ${id}이 없어요`);
  return el as SVGGElement;
}
const cellFill = (container: HTMLElement, id: string) =>
  cell(container, id).querySelector(":scope > rect")!.getAttribute("fill");
const hasCheck = (el: Element) => !!el.querySelector(".lucide-check");
const heartOf = (el: Element) => el.querySelector(".lucide-heart");

describe("지도 다녀온 칸(UI 26-F4)", () => {
  it("다녀온 칸은 map-booth-visited 초록 면이고 체크 아이콘이 없다", () => {
    const { container } = drawMap({ visited: ["c", "f"] });
    expect(cellFill(container, "c")).toBe(C("map-booth-visited"));
    expect(cellFill(container, "f")).toBe(C("map-booth-visited"));
    expect(cellFill(container, "a")).toBe(C("map-booth"));
    expect(hasCheck(container)).toBe(false);
    // 칸 위에 아이콘을 올리지 않는다(발자국도 지도에는 없다).
    expect(cell(container, "c").querySelector("svg")).toBeNull();
  });

  it("테두리는 보통 칸과 같다(초록이나 브랜드 테두리를 두르지 않는다)", () => {
    const { container } = drawMap({ visited: ["c"] });
    const visitedRect = cell(container, "c").querySelector(":scope > rect")!;
    const plainRect = cell(container, "a").querySelector(":scope > rect")!;
    expect(visitedRect.getAttribute("stroke")).toBe(plainRect.getAttribute("stroke"));
    expect(visitedRect.getAttribute("stroke")).toBe(C("stroke-neutral-weak"));
  });

  it("이름은 map-label-mine으로 그린다", () => {
    const { container } = drawMap({ visited: ["c"] });
    const texts = [...cell(container, "c").querySelectorAll("text")];
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) expect(t.getAttribute("fill")).toBe(C("map-label-mine"));
  });

  it("하트도 남긴 다녀온 칸은 초록 면 위에 하트(map-heart-mine)와 이름(map-label-mine)을 둘 다 그린다", () => {
    const { container } = drawMap({ heart: ["b", "d", "f"], visited: ["d", "f"] });
    for (const id of ["d", "f"]) {
      const el = cell(container, id);
      expect(cellFill(container, id)).toBe(C("map-booth-visited"));
      const heart = heartOf(el);
      expect(heart).not.toBeNull();
      expect(heart!.getAttribute("fill")).toBe(C("map-heart-mine"));
      expect(el.textContent!.replace(/\s/g, "")).toContain(booths.find((b) => b.id === id)!.name.replace(/\s/g, ""));
      expect(el.querySelector(`text[fill="${C("map-label-mine")}"]`)).not.toBeNull();
      expect(hasCheck(el)).toBe(false);
    }
    // 하트 자리는 칸 크기와 상관없이 오른쪽 위, 짧은 변 × 0.3(UI/지도/다녀온 칸 3002:4574).
    const big = cell(container, "d").querySelector('[data-mark="visited-heart"]')!;
    const drawW = 120 - 6;
    const drawH = 80 - 6;
    expect(Number(big.getAttribute("width"))).toBeCloseTo(drawH * 0.3);
    expect(Number(big.getAttribute("x")) + Number(big.getAttribute("width"))).toBeCloseTo(drawW / 2 - drawH * 0.06);
    expect(Number(big.getAttribute("y"))).toBeCloseTo(-drawH / 2 + drawH * 0.06);
    // 하트만 남긴 칸은 예전처럼 map-booth-mine.
    expect(cellFill(container, "b")).toBe(C("map-booth-mine"));
    expect(heartOf(cell(container, "b"))).not.toBeNull();
  });

  it("고른 칸은 다녀왔어도 map-booth-selected만 칠한다", () => {
    const { container } = drawMap({ visited: ["e"], heart: ["e"], selectedId: "e" });
    const rect = cell(container, "e").querySelector(":scope > rect")!;
    expect(rect.getAttribute("fill")).toBe(C("map-booth-selected"));
    expect(rect.getAttribute("stroke")).toBe(C("map-booth-selected"));
    expect(hasCheck(container)).toBe(false);
    // 고른 칸의 하트는 흰색(map-label-selected).
    const heart = cell(container, "e").querySelector('[data-mark="visited-heart"]')!;
    expect(heart.getAttribute("fill")).toBe(C("map-label-selected"));
  });

  it("끝난 박람회(F-B, 남긴 곳만 밝게)에서도 다녀온 칸은 초록이고 흐리지 않다", () => {
    const { container } = drawMap({ visited: ["c"], heart: ["b"], highlight: ["b", "c"] });
    expect(cellFill(container, "c")).toBe(C("map-booth-visited"));
    expect(cell(container, "c").getAttribute("opacity")).toBe("1");
    expect(cell(container, "a").getAttribute("opacity")).not.toBe("1");
  });
});
