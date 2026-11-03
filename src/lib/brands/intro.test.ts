import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { planFromRepository } from "@/lib/exhibitor/service";
import { brandIntroForBooth, brandIntroFromField } from "./intro";
import type { ProfileField } from "@/lib/types";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

const field = (over: Partial<ProfileField>): ProfileField => ({
  id: "ex:x1:intro",
  exhibitorId: "x1",
  participantId: null,
  field: "intro",
  value: { original: "원문입니다.", display: "원문이에요.", gate: { ok: true, issues: [] } },
  sources: ["roam:booth/b1"],
  status: "collected",
  verifiedAt: "",
  actor: null,
  createdAt: "",
  updatedAt: "",
  ...over,
});

describe("brandIntroFromField", () => {
  it("게이트를 넘은 바꾼 문장만, 원문 부스를 같이 알려 준다", () => {
    expect(brandIntroFromField(field({}))).toEqual({ text: "원문이에요.", exhibitorId: "x1", sourceBoothId: "b1" });
    expect(brandIntroFromField(field({ status: "ai_draft" }))).toBeNull();
    expect(brandIntroFromField(field({ value: { original: "원문입니다." } }))).toBeNull();
    expect(brandIntroFromField(field({ value: { original: "a", display: "b", gate: { ok: false, issues: ["x"] } } }))).toBeNull();
    expect(brandIntroFromField(field({ status: "reviewed", value: { original: "a", display: "사람이 고친 문장이에요." } }))!.text).toBe("사람이 고친 문장이에요.");
    expect(brandIntroFromField(null)).toBeNull();
  });
});

describe("brandIntroForBooth", () => {
  it("같은 브랜드면 어느 박람회 부스에서도 같은 소개를 준다", async () => {
    const repo = new MockRepository();
    const { plan } = await planFromRepository(repo);
    await repo.applyExhibitorPlan(plan);
    const graph = await repo.loadExhibitorGraph();
    // 두 박람회에 나온 브랜드 하나
    const counts = new Map<string, Set<string>>();
    for (const p of graph.participants) counts.set(p.exhibitorId, (counts.get(p.exhibitorId) ?? new Set()).add(p.exhibitionId));
    const [x] = [...counts].find(([, s]) => s.size >= 2)!;
    const booths = graph.assignments
      .filter((a) => a.role === "primary" && graph.participants.find((p) => p.id === a.participantId)?.exhibitorId === x)
      .map((a) => a.boothId);
    expect(new Set(booths).size).toBeGreaterThanOrEqual(2);
    expect(await brandIntroForBooth(repo, booths[0])).toBeNull();
    await repo.upsertProfileField({
      subject: { exhibitorId: x },
      field: "intro",
      value: { original: "공방입니다.", display: "공방이에요.", gate: { ok: true, issues: [] } },
      sources: [`roam:booth/${booths[0]}`],
      status: "collected",
      actor: "worker:brand-profile-draft",
    });
    for (const b of booths) expect((await brandIntroForBooth(repo, b))!.text).toBe("공방이에요.");
    expect(await brandIntroForBooth(repo, "nope")).toBeNull();
  });
});
