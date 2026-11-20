import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT ${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));

import ExhibitionEntryPage from "./page";

const run = (slug: string, sp: Record<string, string | string[] | undefined> = {}) =>
  ExhibitionEntryPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve(sp) });

describe("박람회 주소는 지도부터(브랜드 규칙 §4, UI 3-01)", () => {
  it("추천 피드 대신 지도로 보낸다", async () => {
    await expect(run("seoul-illustration-fair")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenLastCalledWith("/exhibitions/seoul-illustration-fair/map");
  });

  it("고른 부스가 있으면 지도에서 그 부스를 연다", async () => {
    await expect(run("fair", { booth: "b-1" })).rejects.toThrow();
    expect(redirect).toHaveBeenLastCalledWith("/exhibitions/fair/map?booth=b-1");
  });

  it("옛 피드 주소의 다른 값(rhythm, round)은 버린다", async () => {
    await expect(run("fair", { rhythm: "slow", round: "2" } as never)).rejects.toThrow();
    expect(redirect).toHaveBeenLastCalledWith("/exhibitions/fair/map");
  });
});
