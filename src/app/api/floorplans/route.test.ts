import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { FLOORPLANS } from "@/lib/floorplans";

describe("GET /api/floorplans", () => {
  it("도면이 있는 박람회 전부와 버전을 준다", async () => {
    const { data } = await (await GET()).json();
    expect(data.data.map((d: { slug: string }) => d.slug)).toEqual(Object.keys(FLOORPLANS).sort());
    expect(data.data.find((d: { slug: string }) => d.slug === "sif-2026").hasScale).toBe(true);
  });
});
