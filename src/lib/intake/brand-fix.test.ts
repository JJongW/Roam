import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import type { ProfileField } from "@/lib/types";
import { brandFixFileSchema, planBrandFix, summarizeFix, type BrandFixFile, type BrandFixState } from "./brand-fix";

const field = (exhibitorId: string, f: string, value: unknown, status: ProfileField["status"] = "collected"): ProfileField => ({
  id: `ex:${exhibitorId}:${f}`,
  exhibitorId,
  participantId: null,
  field: f,
  value,
  sources: [],
  status,
  verifiedAt: "2026-11-10T00:00:00Z",
  actor: null,
  createdAt: "2026-11-10T00:00:00Z",
  updatedAt: "2026-11-10T00:00:00Z",
});

const state = (over: Partial<BrandFixState> = {}): BrandFixState => ({
  exhibitionId: "exh1",
  exhibitors: new Map([["ex1", { canonicalName: "어떤웅주", aliases: ["어떤우주"] }]]),
  participants: new Map([["ex1", { id: "pt1", exhibitorId: "ex1", displayName: "어떤웅주", aliases: ["어떤우주"], metadata: { category: "A", brandKey: "ny-1" } }]]),
  otherParticipations: new Map(),
  dependents: new Map(),
  fields: [],
  ...over,
});
const file = (ops: BrandFixFile["ops"]): BrandFixFile => ({ version: "brand-fix.v1", exhibitionSlug: "fair", ops });
const photo = (path: string) => ({ path, scope: "주최 측 사이트" });

describe("planBrandFix", () => {
  it("이름 바꾸기는 새 이름을 별칭에서 빼고 옛 이름을 별칭으로 남긴다, 다시 돌리면 같음", () => {
    const op = { op: "rename" as const, key: "k", exhibitorId: "ex1", from: "어떤웅주", to: "어떤우주" };
    const [p] = planBrandFix(file([op]), state());
    expect(p.action).toBe("write");
    expect(p.write).toEqual({
      kind: "rename",
      exhibitor: { canonicalName: "어떤우주", aliases: ["어떤웅주"] },
      participant: { id: "pt1", displayName: "어떤우주", aliases: ["어떤웅주"] },
    });
    const after = state({
      exhibitors: new Map([["ex1", { canonicalName: "어떤우주", aliases: ["어떤웅주"] }]]),
      participants: new Map([["ex1", { id: "pt1", exhibitorId: "ex1", displayName: "어떤우주", aliases: ["어떤웅주"], metadata: {} }]]),
    });
    expect(planBrandFix(file([op]), after)[0].action).toBe("same");
    const other = state({ exhibitors: new Map([["ex1", { canonicalName: "딴이름", aliases: [] }]]) });
    expect(planBrandFix(file([op]), other)[0].action).toBe("conflict");
  });

  it("분류는 옛 값일 때만 바꾸고 나머지 metadata는 지킨다", () => {
    const op = { op: "setCategory" as const, key: "k", exhibitorId: "ex1", from: "A", to: "B" };
    const [p] = planBrandFix(file([op]), state());
    expect(p.write).toEqual({ kind: "participantMetadata", participantId: "pt1", metadata: { category: "B", brandKey: "ny-1" } });
    expect(planBrandFix(file([{ ...op, from: "C" }]), state())[0].action).toBe("conflict");
    expect(planBrandFix(file([{ ...op, from: "X", to: "A" }]), state())[0].action).toBe("same");
  });

  it("사람이 확인한 칸은 덮지 않는다", () => {
    const op = { op: "setIntro" as const, key: "k", exhibitorId: "ex1", from: "옛", to: "새", source: "s" };
    for (const status of ["reviewed", "artist_confirmed"] as const)
      expect(planBrandFix(file([op]), state({ fields: [field("ex1", "intro", { original: "옛" }, status)] }))[0].action).toBe("blocked");
  });

  it("소개는 원문만 남기고 collected로 쓴다(말투 변환본은 워커가 다시), 기대와 다른 원문은 충돌", () => {
    const op = { op: "setIntro" as const, key: "k", exhibitorId: "ex1", from: "옛", to: "새 전시 소개", source: "s" };
    const cur = field("ex1", "intro", { original: "옛", display: "옛이에요" }, "ai_draft");
    const [p] = planBrandFix(file([op]), state({ fields: [cur] }));
    expect(p.action).toBe("write");
    expect(p.write).toMatchObject({ kind: "field", field: "intro", value: { original: "새 전시 소개" }, expected: { status: "ai_draft" } });
    expect(planBrandFix(file([op]), state({ fields: [field("ex1", "intro", { original: "딴" })] }))[0].action).toBe("conflict");
    expect(planBrandFix(file([op]), state({ fields: [field("ex1", "intro", { original: "새 전시 소개" })] }))[0].action).toBe("same");
  });

  it("사진은 옛 목록과 같을 때만 바꾼다, 빈 칸도 된다", () => {
    const op = { op: "setPhotos" as const, key: "k", exhibitorId: "ex1", from: [photo("a")], to: [photo("b"), photo("c")], source: "s" };
    expect(planBrandFix(file([op]), state({ fields: [field("ex1", "photos", [photo("a")])] }))[0].action).toBe("write");
    expect(planBrandFix(file([op]), state({ fields: [field("ex1", "photos", [photo("x")])] }))[0].action).toBe("conflict");
    expect(planBrandFix(file([op]), state({ fields: [field("ex1", "photos", [photo("b"), photo("c")])] }))[0].action).toBe("same");
    expect(planBrandFix(file([{ ...op, from: [] }]), state())[0].action).toBe("write");
  });

  it("참가 사실 지우기: 허락이 있으면 막고, 없으면 그 행사 참가 사실만, 이미 없으면 같음", () => {
    const op = { op: "removeParticipation" as const, key: "k", exhibitorId: "ex1", name: "어떤웅주", why: "사이트에서 빠짐" };
    const deps = (permissions: number) => new Map([["pt1", { permissions, boothAssignments: 0, linkCandidates: 0, participantFields: 0, outreachLogs: 0 }]]);
    expect(planBrandFix(file([op]), state({ dependents: deps(1) }))[0].action).toBe("blocked");
    const [p] = planBrandFix(file([op]), state({ dependents: deps(0) }));
    expect(p.write).toEqual({ kind: "deleteParticipant", participantId: "pt1" });
    expect(planBrandFix(file([op]), state({ participants: new Map() }))[0].action).toBe("same");
    expect(summarizeFix([p])).toEqual({ write: 1, same: 0, conflict: 0, blocked: 0 });
  });
});

describe("data/brand-fixes", () => {
  it("모든 파일이 brand-fix.v1 계약을 지킨다", () => {
    const dir = "data/brand-fixes";
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) brandFixFileSchema.parse(JSON.parse(readFileSync(`${dir}/${f}`, "utf8")));
  });
});
