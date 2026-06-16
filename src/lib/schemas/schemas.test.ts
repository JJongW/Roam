import { describe, expect, it } from "vitest";
import {
  userPreferenceInputSchema,
  reviewInputSchema,
  waitingInputSchema,
  routeInputSchema,
} from "./index";

describe("userPreferenceInputSchema", () => {
  const valid = {
    visitPurpose: "purchase",
    interests: ["ai"],
    availableMinutes: 120,
    movementPreference: "balanced",
    companionType: "alone",
  };

  it("accepts a valid preference", () => {
    expect(userPreferenceInputSchema.safeParse(valid).success).toBe(true);
  });
  it("requires at least one interest", () => {
    expect(userPreferenceInputSchema.safeParse({ ...valid, interests: [] }).success).toBe(false);
  });
  it("bounds available time", () => {
    expect(userPreferenceInputSchema.safeParse({ ...valid, availableMinutes: 5 }).success).toBe(false);
    expect(userPreferenceInputSchema.safeParse({ ...valid, availableMinutes: 9999 }).success).toBe(false);
  });
  it("rejects unknown enum values", () => {
    expect(userPreferenceInputSchema.safeParse({ ...valid, visitPurpose: "shopping" }).success).toBe(false);
  });
});

describe("reviewInputSchema", () => {
  it("rejects out-of-range ratings", () => {
    expect(reviewInputSchema.safeParse({ rating: 9, comment: "hi", authorName: "a" }).success).toBe(false);
  });
  it("requires a comment", () => {
    expect(reviewInputSchema.safeParse({ rating: 5, comment: "", authorName: "a" }).success).toBe(false);
  });
  it("defaults author to 익명", () => {
    const r = reviewInputSchema.parse({ rating: 5, comment: "good" });
    expect(r.authorName).toBe("익명");
  });
});

describe("waitingInputSchema", () => {
  it("rejects negative queue", () => {
    expect(waitingInputSchema.safeParse({ enabled: true, queueCount: -1, estimatedMinutes: 5 }).success).toBe(false);
  });
});

describe("routeInputSchema", () => {
  it("requires exhibitionSlug and a valid preference", () => {
    expect(
      routeInputSchema.safeParse({
        exhibitionSlug: "techworld-2026",
        preference: {
          visitPurpose: "experience",
          interests: ["gaming"],
          availableMinutes: 60,
          movementPreference: "thorough",
          companionType: "group",
        },
      }).success,
    ).toBe(true);
  });
});
