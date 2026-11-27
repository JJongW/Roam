import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MiniMap } from "./mini-map";
import type { Floorplan } from "@/lib/floorplans";

/** 작은 다녀온 칸 = 초록 면 + 번호, 하트도 남겼으면 오른쪽 위 하트(UI/지도/작은 다녀온 칸 3411:31744, 2026-11-27). */
const C = (name: string) => `var(--roam-v2-color-${name})`;

const floorplan = {
  width: 400,
  height: 200,
  halls: [{ label: "A", x: 0, y: 0, w: 400, h: 200 }],
  booths: [
    { code: "A01", x: 50, y: 50, w: 40, h: 30 },
    { code: "A02", x: 100, y: 50, w: 40, h: 30 },
    { code: "A03", x: 150, y: 50, w: 40, h: 30 },
  ],
} as unknown as Floorplan;

const rectOf = (c: HTMLElement, code: string) =>
  [...c.querySelectorAll("g")].find((g) => g.textContent === code);

describe("작은 다녀온 칸(6-10, 12-06)", () => {
  it("다녀온 칸은 map-booth-visited, 번호는 map-label-mine, 하트 칸만 오른쪽 위 하트", () => {
    const { container } = render(
      <MiniMap floorplan={floorplan} codes={new Set(["A01", "A02"])} heartCodes={new Set(["A02"])} />,
    );
    const fills = [...container.querySelectorAll("rect")].map((r) => r.getAttribute("fill"));
    expect(fills.filter((f) => f === C("map-booth-visited"))).toHaveLength(2);
    expect(fills.filter((f) => f === C("bg-neutral-solid"))).toHaveLength(0);
    const texts = [...container.querySelectorAll("text")];
    expect(texts.map((t) => t.textContent)).toEqual(["A01", "A02"]);
    for (const t of texts) expect(t.getAttribute("fill")).toBe(C("map-label-mine"));
    const hearts = container.querySelectorAll('[data-mark="visited-heart"]');
    expect(hearts).toHaveLength(1);
    expect(hearts[0].getAttribute("fill")).toBe(C("map-heart-mine"));
    expect(rectOf(container, "A02")?.querySelector('[data-mark="visited-heart"]')).toBeTruthy();
  });
});
