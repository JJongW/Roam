import { describe, expect, it, vi } from "vitest";
import { cameFromMap, openMapWithoutStacking } from "./open-map";

describe("cameFromMap", () => {
  it("바로 앞이 그 박람회 지도일 때만 참", () => {
    expect(cameFromMap("/exhibitions/sdf-2026/map", "sdf-2026")).toBe(true);
    expect(cameFromMap("/exhibitions/other/map", "sdf-2026")).toBe(false);
    expect(cameFromMap("/exhibitions/sdf-2026/booths", "sdf-2026")).toBe(false);
    expect(cameFromMap("/me", "sdf-2026")).toBe(false);
    expect(cameFromMap(null, "sdf-2026")).toBe(false);
  });
});

describe("openMapWithoutStacking (4-07)", () => {
  it("앞이 다른 화면이면 상세 자리를 지도로 바꾼다", () => {
    const router = { back: vi.fn(), replace: vi.fn() };
    openMapWithoutStacking(router, "/exhibitions/a/map?booth=b1", { fromMap: false });
    expect(router.replace).toHaveBeenCalledWith("/exhibitions/a/map?booth=b1");
    expect(router.back).not.toHaveBeenCalled();
  });

  it("앞이 그 지도면 뒤로 간 뒤 돌아온 지도 자리를 바꾼다(같은 지도가 두 번 남지 않게)", () => {
    const router = { back: vi.fn(), replace: vi.fn() };
    openMapWithoutStacking(router, "/exhibitions/a/map?booth=b1", { fromMap: true });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(router.replace).toHaveBeenCalledWith("/exhibitions/a/map?booth=b1");
    // 한 번만 듣는다
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(router.replace).toHaveBeenCalledTimes(1);
  });
});
