import { describe, it, expect } from "vitest";
import { loginSchema } from "@/lib/schemas";
import type { Repository } from "@/lib/repositories/types";
import type { User } from "@/lib/types";
import { baseNickname, uniqueNickname } from "./oauth-nickname";

/** Minimal repo stub: only getUserByNickname matters here. */
function repoWith(taken: string[]): Repository {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  return {
    getUserByNickname: async (nickname: string): Promise<User | null> =>
      lower.has(nickname.toLowerCase())
        ? { id: "x", nickname, createdAt: "" }
        : null,
  } as unknown as Repository;
}

const valid = (s: string) => loginSchema.safeParse({ nickname: s }).success;

describe("baseNickname", () => {
  it("strips emoji/dots and keeps a valid nickname", () => {
    expect(valid(baseNickname({ name: "김.도윤 🎉" }))).toBe(true);
  });

  it("falls back to email local part when name is empty", () => {
    expect(baseNickname({ name: "", email: "reader99@x.com" })).toBe("reader99");
  });

  it("falls back to 게스트 when nothing usable", () => {
    expect(baseNickname({ name: "🎉", email: "" })).toBe("게스트");
    expect(baseNickname({ name: null, email: null })).toBe("게스트");
  });

  it("caps at 20 chars", () => {
    expect(baseNickname({ name: "a".repeat(50) }).length).toBe(20);
  });
});

describe("uniqueNickname", () => {
  it("returns the base when free", async () => {
    expect(await uniqueNickname(repoWith([]), { name: "도윤" })).toBe("도윤");
  });

  it("appends a suffix on collision and stays valid + unique", async () => {
    const out = await uniqueNickname(repoWith(["도윤", "도윤 2"]), {
      name: "도윤",
    });
    expect(out).toBe("도윤 3");
    expect(valid(out)).toBe(true);
  });
});
