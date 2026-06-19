import { describe, expect, it } from "vitest";
import {
  normalizeBoothKey,
  isUnassignedBooth,
  boothMatchKeys,
  exhibitorBooths,
  isFacility,
} from "./normalize";
import { auditBooths, reconcile } from "./reconcile";
import type { Booth } from "@/lib/types";

function booth(p: Partial<Booth>): Booth {
  return {
    id: p.id ?? p.code ?? "x",
    exhibitionId: "e",
    hallId: "h",
    categoryId: "c",
    code: p.code,
    name: p.name ?? p.code ?? "",
    company: p.company ?? "",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x: p.x ?? 0,
    y: p.y ?? 0,
    popularity: 50,
    createdAt: "",
    ...p,
  };
}

describe("normalizeBoothKey", () => {
  it("collapses spacing, punctuation, and publisher suffixes", () => {
    expect(normalizeBoothKey("도서출판 부카")).toBe("도서출판부카");
    expect(normalizeBoothKey("부카(주)")).toBe("부카주");
    expect(normalizeBoothKey("BUKA Press")).toBe("buka");
    expect(normalizeBoothKey("단추 출판사")).toBe("단추");
  });
});

describe("boothMatchKeys", () => {
  it("includes co-located exhibitor aliases as lookup keys", () => {
    const keys = boothMatchKeys(
      booth({ code: "A108", name: "도서출판 달리", aliases: ["곰세마리"] }),
    );
    expect(keys).toContain(normalizeBoothKey("곰세마리"));
    expect(keys).toContain(normalizeBoothKey("도서출판 달리"));
  });
});

describe("exhibitorBooths / isFacility", () => {
  it("drops facility slots, keeps exhibitors", () => {
    const list = [
      booth({ id: "1", name: "윌북", company: "문학" }),
      booth({ id: "2", name: "라운지", kind: "facility" }),
    ];
    expect(isFacility(list[1])).toBe(true);
    expect(exhibitorBooths(list).map((b) => b.id)).toEqual(["1"]);
  });
});

describe("isUnassignedBooth", () => {
  it("flags slots whose name is just the code or has no company", () => {
    expect(isUnassignedBooth(booth({ code: "A113", name: "A113" }))).toBe(true);
    expect(
      isUnassignedBooth(
        booth({ code: "A101", name: "고스트북스", company: "예술" }),
      ),
    ).toBe(false);
  });
});

describe("auditBooths", () => {
  it("reports unassigned, dup codes, and dup names", () => {
    const a = auditBooths([
      booth({ id: "1", code: "A1", name: "가나출판", company: "문학" }),
      booth({ id: "2", code: "A1", name: "가나 출판사", company: "문학" }),
      booth({ id: "3", code: "A3", name: "A3" }),
    ]);
    expect(a.total).toBe(3);
    expect(a.duplicateCodes).toContain("A1");
    expect(a.duplicateNames).toContain("가나");
    expect(a.unassigned.map((b) => b.id)).toEqual(["3"]);
  });
});

describe("reconcile", () => {
  const booths = [
    booth({ id: "1", code: "A101", name: "고스트북스", company: "예술" }),
    booth({ id: "2", code: "A102", name: "별빛들", company: "문학" }),
    booth({ id: "3", code: "A113", name: "A113" }), // unassigned slot
  ];

  it("matches by code first, then by normalized name", () => {
    const r = reconcile(
      [
        { code: "A101", name: "고스트북스" },
        { name: "별빛들" }, // no code → name match
      ],
      booths,
    );
    expect(r.matched).toHaveLength(2);
    expect(r.missingFromMap).toHaveLength(0);
  });

  it("reports official exhibitors missing from the map", () => {
    const r = reconcile([{ code: "Z999", name: "없는출판사" }], booths);
    expect(r.missingFromMap).toHaveLength(1);
    expect(r.missingFromMap[0].name).toBe("없는출판사");
  });

  it("reports booths not present in the official list (no-match cleanup set)", () => {
    const r = reconcile([{ code: "A101", name: "고스트북스" }], booths);
    const codes = r.notInOfficial.map((b) => b.code);
    expect(codes).toContain("A113");
    expect(codes).toContain("A102");
  });
});
