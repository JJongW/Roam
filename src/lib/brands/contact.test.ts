import { describe, expect, it } from "vitest";
import {
  applyChecklist,
  emptyContact,
  mergeContactPatch,
  parseAllowedUse,
  summarizeContacts,
} from "./contact";
import { brandContactLogInputSchema, brandContactPatchSchema } from "@/lib/schemas";
import type { BrandContact } from "@/lib/types";

describe("applyChecklist", () => {
  it("처음 완료 시각을 지키고, 끄면 지우고, 안 보낸 항목은 그대로 둔다", () => {
    const prev = { "dm-sent": "2026-11-01T00:00:00.000Z", "image-received": "2026-11-02T00:00:00.000Z" };
    const next = applyChecklist(prev, { "dm-sent": true, "image-received": false, "thanks-sent": true }, "2026-11-03T00:00:00.000Z");
    expect(next).toEqual({ "dm-sent": "2026-11-01T00:00:00.000Z", "thanks-sent": "2026-11-03T00:00:00.000Z" });
  });
});

describe("mergeContactPatch", () => {
  it("보낸 키만 바꾼다", () => {
    const base: BrandContact = { ...emptyContact("b1", "e1", "t0"), notes: "그대로", handle: "@a" };
    const next = mergeContactPatch(base, { status: "sent", handle: null }, "ted@x", "t1");
    expect(next).toMatchObject({ status: "sent", handle: null, notes: "그대로", updatedBy: "ted@x", updatedAt: "t1", createdAt: "t0" });
  });
});

describe("summarizeContacts", () => {
  it("행이 없는 부스는 미연락으로 센다, 철회는 허락에서 뺀다", () => {
    const m = new Map<string, Pick<BrandContact, "status">>([
      ["a", { status: "sent" }],
      ["b", { status: "granted" }],
      ["c", { status: "partial" }],
      ["d", { status: "withdrawn" }],
      ["e", { status: "replied" }],
    ]);
    const s = summarizeContacts(["a", "b", "c", "d", "e", "f"], m);
    expect(s).toMatchObject({ total: 6, sent: 5, replied: 4, granted: 2 });
    expect(s.byStatus["not-sent"]).toBe(1);
  });
});

describe("parseAllowedUse", () => {
  it("csv 표기를 토큰으로 쪼갠다", () => {
    expect(parseAllowedUse("account-photo; tag; reuse-05; tag")).toEqual(["account-photo", "tag", "reuse-05"]);
    expect(parseAllowedUse("")).toEqual([]);
  });
});

describe("brandContactPatchSchema", () => {
  it("안 보낸 키를 만들지 않는다(default 없음)", () => {
    expect(brandContactPatchSchema.parse({ status: "sent" })).toEqual({ status: "sent" });
  });
  it("빈 문자열은 null로, 모르는 체크리스트 항목과 키는 막는다", () => {
    expect(brandContactPatchSchema.parse({ handle: "  " })).toEqual({ handle: null });
    expect(brandContactPatchSchema.safeParse({ checklist: { nope: true } }).success).toBe(false);
    expect(brandContactPatchSchema.safeParse({ wat: 1 }).success).toBe(false);
    expect(brandContactPatchSchema.safeParse({ status: "maybe" }).success).toBe(false);
    expect(brandContactPatchSchema.safeParse({ sentAt: "11-05" }).success).toBe(false);
  });
  it("로그는 내용이 있어야 한다", () => {
    expect(brandContactLogInputSchema.safeParse({ direction: "inbound", kind: "message", summary: " " }).success).toBe(false);
  });
});
