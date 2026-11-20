import { describe, expect, it } from "vitest";
import { reentryView } from "./reentry";
import type { Repository } from "@/lib/repositories/types";
import type { NoteWithContext, UpcomingParticipation } from "@/lib/types";

const fair = (id: string, start: string, end = start) => ({ id, slug: id, name: `${id} 박람회`, venue: "코엑스", startDate: start, endDate: end });
const note = (o: Partial<NoteWithContext> & { boothId: string }): NoteWithContext => ({
  userId: "u",
  updatedAt: "2026-10-01T00:00:00Z",
  booth: null,
  exhibition: fair("past", "2026-10-01"),
  brand: null,
  ...o,
});
const up = (exhibitorId: string, f: ReturnType<typeof fair>): UpcomingParticipation => ({
  exhibitorId,
  participantId: `${exhibitorId}-${f.id}`,
  displayName: exhibitorId,
  exhibition: f,
});

function repoWith(notes: NoteWithContext[], hearts: string[], upcoming: UpcomingParticipation[]) {
  const asked: string[][] = [];
  const repo = {
    listNotesWithContext: async () => notes,
    listBrandHearts: async () => hearts.map((exhibitorId) => ({ userId: "u", exhibitorId, createdAt: "t" })),
    getExhibitorNames: async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `브랜드 ${id}`])),
    listUpcomingParticipations: async (ids: string[]) => {
      asked.push(ids);
      return upcoming.filter((u) => ids.includes(u.exhibitorId));
    },
  } as unknown as Repository;
  return { repo, asked };
}

describe("reentryView", () => {
  const brand = (exhibitorId: string) => ({ exhibitorId, participantId: `p-${exhibitorId}`, name: `브랜드 ${exhibitorId}` });
  const next = fair("next", "2026-12-04", "2026-12-07");

  it("다녀왔어요, 부스 하트, 그저 그랬어요만 남긴 브랜드는 좋아한 것으로 보지 않는다", async () => {
    const { repo, asked } = repoWith(
      [
        note({ boothId: "b1", visitedAt: "t", visited: true, brand: brand("a") }),
        note({ boothId: "b2", heart: true, heartedAt: "t", brand: brand("b") }),
        note({ boothId: "b3", verdict: "ok", visitedAt: "t", brand: brand("c") }),
      ],
      [],
      [up("a", next), up("b", next), up("c", next)],
    );
    const out = await reentryView(repo, "u", "2026-11-20");
    expect(out.brands).toEqual([]);
    expect(asked).toEqual([]); // 근거가 없으면 참가를 묻지도 않는다
  });

  it("좋았어요 브랜드가 다음 박람회에 나오면 그 참가를 붙이고, 좋았어요를 남긴 박람회는 다음으로 치지 않는다", async () => {
    const same = fair("past", "2026-10-01", "2026-12-31"); // 아직 안 끝난 같은 박람회
    const { repo } = repoWith(
      [note({ boothId: "b1", verdict: "good", verdictAt: "2026-10-02T00:00:00Z", exhibition: same, brand: brand("a") })],
      [],
      [up("a", same), up("a", next)],
    );
    const out = await reentryView(repo, "u", "2026-11-20");
    expect(out.brands).toHaveLength(1);
    expect(out.brands[0]).toMatchObject({
      exhibitorId: "a",
      name: "브랜드 a",
      reasons: ["verdict_good"],
      hearted: false,
      likedAt: { slug: "past", name: "past 박람회", at: "2026-10-02T00:00:00Z" },
    });
    expect(out.brands[0].next.exhibition.slug).toBe("next");
  });

  it("브랜드 하트도 근거다. 둘 다면 이유가 둘이고 하트 상태를 알려 준다", async () => {
    const later = fair("later", "2027-01-10");
    const { repo } = repoWith(
      [note({ boothId: "b1", verdict: "good", brand: brand("a") })],
      ["a", "h"],
      [up("a", later), up("h", next)],
    );
    const out = await reentryView(repo, "u", "2026-11-20");
    expect(out.brands.map((b) => b.exhibitorId)).toEqual(["h", "a"]); // 먼저 열리는 순
    expect(out.brands[1]).toMatchObject({ reasons: ["verdict_good", "brand_heart"], hearted: true });
    expect(out.brands[0]).toMatchObject({ reasons: ["brand_heart"], hearted: true });
    expect(out.brands[0].likedAt).toBeUndefined();
  });

  it("다음 참가가 없는 브랜드와 부스에 브랜드가 안 이어진 평가는 빠진다", async () => {
    const { repo } = repoWith(
      [note({ boothId: "b1", verdict: "good", brand: brand("a") }), note({ boothId: "b2", verdict: "good", brand: null })],
      [],
      [],
    );
    expect((await reentryView(repo, "u", "2026-11-20")).brands).toEqual([]);
  });

  it("부스 배정 전 참가(booth 없음)도 나온다", async () => {
    const { repo } = repoWith([note({ boothId: "b1", verdict: "good", brand: brand("a") })], [], [up("a", next)]);
    const out = await reentryView(repo, "u", "2026-11-20");
    expect(out.brands[0].next.booth).toBeUndefined();
  });
});
