import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIntakeFile, intakeFileKind } from "./schema";
import { planExhibitionFromRepository, type ExhibitionFile } from "./exhibition-file";

const readData = (p: string) => JSON.parse(readFileSync(join(process.cwd(), "data", p), "utf8")) as Record<string, unknown>;
const sdf = () => readData("exhibitions/sdf-2026.json");

describe("파일 종류 가르기", () => {
  it("version으로 먼저 가르고, version 없이 slug가 있으면 행사 행이에요", () => {
    expect(intakeFileKind({ version: 1 })).toBe("booths");
    expect(intakeFileKind({ version: "brands.v1" })).toBe("brands");
    expect(intakeFileKind({ version: "exhibition.v1" })).toBe("exhibition");
    expect(intakeFileKind(sdf())).toBe("exhibition");
    expect(intakeFileKind({ exhibitionSlug: "x" })).toBeNull();
    expect(intakeFileKind({ version: 2, slug: "x" })).toBeNull();
    expect(intakeFileKind([])).toBeNull();
  });
});

describe("행사 행 파일 형식 검사(checkIntakeFile, 화면과 드라이런이 같이 쓴다)", () => {
  it("레포의 행사 파일은 전부 통과해요", () => {
    for (const p of ["exhibitions/sdf-2026.json", "exhibitions/moongu-2026-winter.json"]) {
      const r = checkIntakeFile(readData(p));
      expect(r.ok, p).toBe(true);
      expect(r.kind).toBe("exhibition");
    }
  });

  it("version: exhibition.v1을 적어도 통과하고, 본문에선 version을 떼요", async () => {
    const r = checkIntakeFile({ ...sdf(), version: "exhibition.v1" });
    expect(r.ok && r.kind).toBe("exhibition");
    const plan = await planExhibitionFromRepository({ getExhibitionIdBySlug: async () => null }, (r as { file: ExhibitionFile }).file);
    expect(plan.exhibition).not.toHaveProperty("version");
  });

  it("틀린 칸을 전부, 칸 이름과 함께 돌려줘요", () => {
    const raw = { ...sdf(), slug: "SDF 2026", name: undefined, venu: "코엑스", startDate: "2026.11.26" };
    const r = checkIntakeFile(raw);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.kind).toBe("exhibition");
    const byPath = Object.fromEntries(r.issues.map((i) => [i.path, i.message]));
    expect(byPath.slug).toMatch(/소문자, 숫자, 하이픈/);
    expect(byPath.name).toBe("빠진 칸이에요");
    expect(byPath[""]).toMatch(/모르는 칸이에요: venu/);
    expect(byPath.startDate).toMatch(/2026-11-26 모양/);
  });

  it("안내 문구 칸 이름이 틀리면 버리지 않고 막아요", () => {
    const r = checkIntakeFile({ ...sdf(), tips: { tickets: "10,000원" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toEqual({ path: "tips", message: "모르는 칸이에요: tickets" });
  });

  it("끝나는 날이 시작일보다 앞이면 막아요", () => {
    const r = checkIntakeFile({ ...sdf(), startDate: "2026-11-29", endDate: "2026-11-26" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues).toEqual([{ path: "endDate", message: "끝나는 날이 시작일보다 앞이에요" }]);
  });

  it("모르는 파일이면 종류 없이 막아요", () => {
    expect(checkIntakeFile({ hello: 1 })).toMatchObject({ ok: false, kind: null });
  });
});

describe("행사 행 계획", () => {
  it("운영에 같은 slug가 없으면 새로 만들고, 있으면 그 id와 함께 이미 있어요", async () => {
    const r = checkIntakeFile(sdf());
    if (!r.ok || r.kind !== "exhibition") throw new Error("픽스처");
    const fresh = await planExhibitionFromRepository({ getExhibitionIdBySlug: async () => null }, r.file);
    expect(fresh).toMatchObject({ status: "create", existingId: null });
    expect(fresh.exhibition).toMatchObject({ slug: "sdf-2026", venue: "코엑스 1층 A홀", startDate: "2026-11-26" });
    const taken = await planExhibitionFromRepository({ getExhibitionIdBySlug: async () => "exh_sdf-2026" }, r.file);
    expect(taken).toMatchObject({ status: "exists", existingId: "exh_sdf-2026" });
  });
});
