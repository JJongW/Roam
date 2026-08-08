import { describe, expect, it } from "vitest";
import { pickAdminExhibition, todayISO } from "./current";
import type { Exhibition } from "@/lib/types";

function ex(id: string, startDate: string, endDate: string): Exhibition {
  return {
    id,
    slug: id,
    name: id,
    venue: "",
    description: "",
    startDate,
    endDate,
    mapWidth: 100,
    mapHeight: 100,
    tips: {},
    createdAt: "2026-01-01T00:00:00.000Z",
  } as Exhibition;
}

// 실제로 문제가 된 배치 — id 오름차순이면 house_archive가 먼저 잡힌다.
const sibf = ex("exh_sibf_2026", "2026-06-10", "2026-06-14");
const sif = ex("exh_sif_2026", "2026-07-30", "2026-08-02");
const ha = ex("exh_house_archive_2026", "2026-08-13", "2026-08-16");
const all = [ha, sibf, sif];

describe("pickAdminExhibition", () => {
  it("지금 열려 있는 전시를 고른다", () => {
    expect(pickAdminExhibition(all, "2026-07-31")?.id).toBe("exh_sif_2026");
  });

  it("시작일·종료일 당일도 열린 것으로 본다", () => {
    expect(pickAdminExhibition(all, "2026-07-30")?.id).toBe("exh_sif_2026");
    expect(pickAdminExhibition(all, "2026-08-02")?.id).toBe("exh_sif_2026");
  });

  // 개막 전날에 8/13 전시가 잡히면 운영자는 빈 대시보드를 본다.
  it("열린 게 없으면 개막이 가장 가까운 전시", () => {
    expect(pickAdminExhibition(all, "2026-07-29")?.id).toBe("exh_sif_2026");
  });

  it("예정도 없으면 가장 최근에 끝난 전시", () => {
    expect(pickAdminExhibition(all, "2026-09-01")?.id).toBe(
      "exh_house_archive_2026",
    );
  });

  it("동시에 열려 있으면 먼저 시작한 것", () => {
    const a = ex("a", "2026-07-01", "2026-08-31");
    const b = ex("b", "2026-07-15", "2026-08-31");
    expect(pickAdminExhibition([b, a], "2026-08-01")?.id).toBe("a");
  });

  it("목록이 비면 undefined", () => {
    expect(pickAdminExhibition([], "2026-07-29")).toBeUndefined();
  });

  it("입력 배열을 바꾸지 않는다", () => {
    const list = [ha, sibf, sif];
    pickAdminExhibition(list, "2026-09-01");
    expect(list[0].id).toBe("exh_house_archive_2026");
  });
});

describe("todayISO", () => {
  it("YYYY-MM-DD로 자른다", () => {
    expect(todayISO(new Date("2026-07-29T15:04:05.000Z"))).toBe("2026-07-29");
  });
});

import { resolveAdminExhibition } from "./current";

describe("resolveAdminExhibition", () => {
  it("쿠키의 전시 id가 목록에 있으면 그 전시를 고른다", () => {
    // sif가 자동 선택 대상이 아닌 날짜(2026-09-01, house_archive가 자동 선택됨)에도
    // 쿠키가 sibf를 가리키면 sibf를 고른다.
    expect(
      resolveAdminExhibition(all, "exh_sibf_2026", "2026-09-01")?.id,
    ).toBe("exh_sibf_2026");
  });

  it("쿠키가 없으면 pickAdminExhibition과 동일하게 자동 선택한다", () => {
    expect(resolveAdminExhibition(all, undefined, "2026-07-31")?.id).toBe(
      pickAdminExhibition(all, "2026-07-31")?.id,
    );
  });

  it("쿠키의 전시 id가 목록에 없으면(삭제됨) 자동 선택으로 폴백한다", () => {
    expect(
      resolveAdminExhibition(all, "exh_deleted", "2026-07-31")?.id,
    ).toBe(pickAdminExhibition(all, "2026-07-31")?.id);
  });

  it("목록이 비면 undefined", () => {
    expect(resolveAdminExhibition([], "exh_sibf_2026", "2026-07-31")).toBeUndefined();
  });
});
