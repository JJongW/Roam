import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { brandsFileSchema } from "@/lib/intake/brands-schema";

// 레포에 남긴 brands.v1 파일도 재생 경로다. 깨진 채로 두면 다시 올릴 때야 알게 된다.
const DIR = join(process.cwd(), "data/brands");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.startsWith("_"));

describe("data/brands 파일", () => {
  for (const f of files) {
    it(`${f}: brands.v1 계약을 만족한다`, () => {
      const parsed = brandsFileSchema.safeParse(JSON.parse(readFileSync(join(DIR, f), "utf8")));
      expect(parsed.error?.issues ?? []).toEqual([]);
    });
  }
});
