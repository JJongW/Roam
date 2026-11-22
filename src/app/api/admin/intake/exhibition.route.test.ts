import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getRepository } from "@/lib/repositories";
import { POST as intake } from "./route";
import { POST as createExhibition } from "../../exhibitions/route";

// 로컬과 테스트에선 운영자 게이트가 꺼져 있어 requireAdmin이 통과한다. 저장소는 mock이다.
const sdf = () => JSON.parse(readFileSync(join(process.cwd(), "data/exhibitions/sdf-2026.json"), "utf8")) as Record<string, unknown>;
const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("/api/admin/intake 행사 행 파일", () => {
  it("미리보기는 새로 만들어요를 돌려주고 아무것도 쓰지 않아요", async () => {
    const res = await post(intake, { file: sdf() });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.kind).toBe("exhibition");
    expect(data.plan).toMatchObject({ status: "create", existingId: null, exhibition: { slug: "sdf-2026", name: "제25회 서울디자인페스티벌" } });
    expect(data.applied).toBeNull();
    expect(await (await getRepository()).getExhibitionIdBySlug("sdf-2026")).toBeNull();
  });

  it("적용하면 만들고, 다음 미리보기는 이미 있어요(id)이고, 다시 적용하면 막아요", async () => {
    const applied = await post(intake, { file: sdf(), apply: true });
    expect(applied.status).toBe(200);
    const { data } = await applied.json();
    expect(data.applied.slug).toBe("sdf-2026");
    const repo = await getRepository();
    const id = await repo.getExhibitionIdBySlug("sdf-2026");
    expect(id).toBe(data.applied.id);
    const row = await repo.getExhibition("sdf-2026");
    expect(row?.exhibition.tips.ticket).toMatch(/15,000원/);

    const again = await (await post(intake, { file: sdf() })).json();
    expect(again.data.plan).toMatchObject({ status: "exists", existingId: id });

    const blocked = await post(intake, { file: sdf(), apply: true });
    expect(blocked.status).toBe(409);
    const body = await blocked.json();
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.fields.slug[0]).toContain(id);
  });

  it("형식이 틀린 파일은 400이고 만들지 않아요", async () => {
    const res = await post(intake, { file: { ...sdf(), slug: "SDF 2026" }, apply: true });
    expect(res.status).toBe(400);
    expect(await (await getRepository()).getExhibitionIdBySlug("SDF 2026")).toBeNull();
  });
});

describe("POST /api/exhibitions 주소 이름 검사(어드민 행사 만들기)", () => {
  const body = { slug: "sdf-2026", name: "제25회 서울디자인페스티벌", venue: "코엑스", startDate: "2026-11-26", endDate: "2026-11-29" };

  it("형식이 틀린 주소 이름은 칸 오류로 막아요", async () => {
    const res = await post(createExhibition, { ...body, slug: "서울디자인" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.fields.slug).toBeTruthy();
  });

  it("이미 쓰는 주소 이름은 칸 오류로 막아요", async () => {
    expect((await post(createExhibition, body)).status).toBe(201);
    const dup = await post(createExhibition, body);
    expect(dup.status).toBe(400);
    expect((await dup.json()).error.fields.slug[0]).toMatch(/이미 다른 행사가 이 주소를/);
  });
});
