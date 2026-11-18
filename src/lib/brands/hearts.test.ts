import { describe, expect, it } from "vitest";
import { brandHeartViews, kstToday } from "./hearts";
import type { Repository } from "@/lib/repositories/types";

describe("brandHeartViews", () => {
  it("한국 날짜로 오늘을 센다", () => {
    expect(kstToday(new Date("2026-11-16T16:00:00Z"))).toBe("2026-11-17");
  });

  it("브랜드마다 다가오는 참가만 붙인다", async () => {
    const repo = {
      listBrandHearts: async () => [{ userId: "u", exhibitorId: "a", createdAt: "t" }],
      getExhibitorNames: async () => ({ a: "에이" }),
      listUpcomingParticipations: async () => [
        { exhibitorId: "a", participantId: "p", displayName: "에이", exhibition: { id: "e", slug: "s", name: "n", venue: "v", startDate: "2026-12-01", endDate: "2026-12-03" } },
        { exhibitorId: "b", participantId: "q", displayName: "비", exhibition: { id: "e", slug: "s", name: "n", venue: "v", startDate: "2026-12-01", endDate: "2026-12-03" } },
      ],
    } as unknown as Repository;
    const out = await brandHeartViews(repo, "u", "2026-11-17");
    expect(out).toHaveLength(1);
    expect(out[0].upcoming.map((u) => u.participantId)).toEqual(["p"]);
  });
});
