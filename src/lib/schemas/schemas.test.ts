import { describe, expect, it } from "vitest";
import {
  boothEnrichmentAuthorInputSchema,
  boothEnrichmentPatchSchema,
} from "@/lib/schemas";
import {
  userPreferenceInputSchema,
  reviewInputSchema,
  routeInputSchema,
} from "./index";

describe("userPreferenceInputSchema", () => {
  const valid = {
    visitPurposes: ["purchase"],
    interests: ["ai"],
    availableMinutes: 120,
    movementPreference: "balanced",
    companionType: "alone",
  };

  it("accepts multiple purposes", () => {
    expect(
      userPreferenceInputSchema.safeParse({
        ...valid,
        visitPurposes: ["purchase", "experience"],
      }).success,
    ).toBe(true);
  });
  it("rejects an empty purpose list", () => {
    expect(
      userPreferenceInputSchema.safeParse({ ...valid, visitPurposes: [] })
        .success,
    ).toBe(false);
  });

  it("accepts a valid preference", () => {
    expect(userPreferenceInputSchema.safeParse(valid).success).toBe(true);
  });
  it("requires at least one interest", () => {
    expect(
      userPreferenceInputSchema.safeParse({ ...valid, interests: [] }).success,
    ).toBe(false);
  });
  it("bounds available time", () => {
    expect(
      userPreferenceInputSchema.safeParse({ ...valid, availableMinutes: 5 })
        .success,
    ).toBe(false);
    expect(
      userPreferenceInputSchema.safeParse({ ...valid, availableMinutes: 9999 })
        .success,
    ).toBe(false);
  });
  it("rejects unknown enum values", () => {
    expect(
      userPreferenceInputSchema.safeParse({
        ...valid,
        visitPurposes: ["shopping"],
      }).success,
    ).toBe(false);
  });
});

describe("reviewInputSchema", () => {
  it("requires a comment", () => {
    expect(
      reviewInputSchema.safeParse({ comment: "", authorName: "a" }).success,
    ).toBe(false);
  });
  it("defaults author to 익명", () => {
    const r = reviewInputSchema.parse({ comment: "good" });
    expect(r.authorName).toBe("익명");
  });
});

describe("routeInputSchema", () => {
  it("requires exhibitionSlug and a valid preference", () => {
    expect(
      routeInputSchema.safeParse({
        exhibitionSlug: "techworld-2026",
        preference: {
          visitPurposes: ["experience"],
          interests: ["gaming"],
          availableMinutes: 60,
          movementPreference: "thorough",
          companionType: "group",
        },
      }).success,
    ).toBe(true);
  });
});

describe("boothEnrichmentPatchSchema", () => {
  it("안 보낸 필드에 키를 만들지 않는다", () => {
    const out = boothEnrichmentPatchSchema.parse({ thingsToDo: ["a"] });
    expect(Object.keys(out)).toEqual(["thingsToDo"]);
  });

  it("author 스키마의 partial()은 default 때문에 못 쓴다 — 이 차이가 사고의 원인이었다", () => {
    // Zod의 partial()은 optional로 감싸기만 하고 default()를 막지 않는다.
    const viaPartial = boothEnrichmentAuthorInputSchema
      .partial()
      .parse({ thingsToDo: ["a"] });
    expect(Object.keys(viaPartial)).toContain("summary"); // ← 안 보냈는데 생긴다
    expect((viaPartial as { summary?: string }).summary).toBe("");
  });
});
