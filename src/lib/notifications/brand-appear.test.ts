import { describe, expect, it } from "vitest";
import {
  apnsBody,
  buildPush,
  dedupeKey,
  inSendWindow,
  kstDay,
  kstDayStartIso,
  matchBrandAppear,
  singleCopy,
  type BrandAppearItem,
} from "./brand-appear";
import type { BrandHeart, NewParticipation } from "@/lib/types";

const part = (over: Partial<NewParticipation> & { exhibitorId: string }): NewParticipation => ({
  participantId: `pt-${over.exhibitorId}`,
  displayName: `${over.exhibitorId} 표기`,
  createdAt: "2026-11-19T00:00:00.000Z",
  exhibition: { id: "ex-1", slug: "newyear-store-2026", name: "새해준비상점", startDate: "2026-12-11", endDate: "2026-12-14" },
  ...over,
});

const item = (over: Partial<BrandAppearItem> & { exhibitorId: string }): BrandAppearItem => ({
  brandName: `${over.exhibitorId}상점`,
  exhibitionId: "ex-1",
  slug: "newyear-store-2026",
  fairName: "새해준비상점",
  startDate: "2026-12-11",
  endDate: "2026-12-14",
  participantId: `pt-${over.exhibitorId}`,
  ...over,
});

describe("한국 시각", () => {
  it("보내는 시간은 한국 10시부터 20시 전까지", () => {
    expect(inSendWindow(new Date("2026-11-19T00:59:00Z"))).toBe(false); // 09:59
    expect(inSendWindow(new Date("2026-11-19T01:00:00Z"))).toBe(true); // 10:00
    expect(inSendWindow(new Date("2026-11-19T10:59:00Z"))).toBe(true); // 19:59
    expect(inSendWindow(new Date("2026-11-19T11:00:00Z"))).toBe(false); // 20:00
    expect(inSendWindow(new Date("2026-11-19T16:00:00Z"))).toBe(false); // 다음 날 01:00
  });

  it("한국 날짜와 그 날이 시작한 순간", () => {
    const d = new Date("2026-11-19T15:30:00Z"); // 한국 11-20 00:30
    expect(kstDay(d)).toBe("2026-11-20");
    expect(kstDayStartIso(d)).toBe("2026-11-19T15:00:00.000Z");
  });
});

describe("문구", () => {
  it("받침에 맞춰 조사를 고르고, 부스가 있을 때만 지도 이야기를 한다", () => {
    expect(singleCopy("모모상점", "새해준비상점", true)).toEqual({
      title: "모모상점이 새해준비상점에 나와요",
      body: "하트 남겨 두신 브랜드예요. 지도에서 자리를 볼 수 있어요.",
    });
    expect(singleCopy("오브제하우스", "새해준비상점", false)).toEqual({
      title: "오브제하우스가 새해준비상점에 나와요",
      body: "하트 남겨 두신 브랜드예요.",
    });
  });

  it("영문으로 끝나 받침을 모르면 조사가 필요 없는 문장으로 바꾼다", () => {
    expect(singleCopy("Studio Roam", "새해준비상점", false).title).toBe("Studio Roam 브랜드가 새해준비상점에 나와요");
  });

  it("문구에 가운뎃점과 '전시'가 없고 해요체다", () => {
    const all = [
      singleCopy("모모상점", "새해준비상점", true),
      singleCopy("Studio", "새해준비상점", false),
      buildPush([item({ exhibitorId: "a" }), item({ exhibitorId: "b" })]),
      buildPush([item({ exhibitorId: "a" }), item({ exhibitorId: "b", slug: "sdf-2026", fairName: "서울디자인페스티벌" })]),
    ].flatMap((c) => [c.title, c.body]);
    for (const s of all) {
      expect(s).not.toMatch(/[·]|전시|합니다|습니다/);
    }
  });
});

describe("고르기", () => {
  const hearts: BrandHeart[] = [
    { userId: "u1", exhibitorId: "a", createdAt: "2026-11-01T00:00:00Z", source: "direct" },
    { userId: "u2", exhibitorId: "a", createdAt: "2026-11-01T00:00:00Z", source: "direct" },
    { userId: "u3", exhibitorId: "a", createdAt: "2026-11-19T05:00:00Z", source: "direct" }, // 참가가 생긴 뒤
    { userId: "u1", exhibitorId: "b", createdAt: "2026-11-01T00:00:00Z", source: "direct" },
  ];

  it("새 참가 × 하트, 참가 뒤 하트만 뺀다(끈 사람도 고른다, 알림함용)", () => {
    const { rows, skipped } = matchBrandAppear({
      participations: [part({ exhibitorId: "a", booth: { id: "booth-a", name: "A" } }), part({ exhibitorId: "b" })],
      hearts,
      brandNames: { a: "모모상점", b: "오브제하우스" },
    });
    expect(rows.map((r) => r.dedupeKey)).toEqual([
      dedupeKey("u1", "a", "ex-1"),
      dedupeKey("u2", "a", "ex-1"),
      dedupeKey("u1", "b", "ex-1"),
    ]);
    expect(rows[0]).toMatchObject({
      kind: "brand_appear",
      title: "모모상점이 새해준비상점에 나와요",
      payload: { exhibitorId: "a", boothId: "booth-a", slug: "newyear-store-2026" },
    });
    expect(rows[2].payload).not.toHaveProperty("boothId");
    expect(skipped).toEqual([
      { userId: "u3", exhibitorId: "a", exhibitionId: "ex-1", reason: "hearted_after" },
    ]);
  });

  it("같은 (사용자, 브랜드, 박람회)는 한 번만", () => {
    const p = part({ exhibitorId: "a" });
    const { rows } = matchBrandAppear({ participations: [p, { ...p, participantId: "dup" }], hearts: hearts.slice(0, 1), brandNames: {} });
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("a 표기가 새해준비상점에 나와요"); // 브랜드 이름이 없으면 참가 표기 이름
  });
});

describe("푸시 모양(iOS PushLanding과 같게)", () => {
  it("하나면 kind brand, slug, exhibitorIds 하나, boothId", () => {
    const push = buildPush([item({ exhibitorId: "a", boothId: "booth-a" })]);
    expect(apnsBody(push)).toEqual({
      aps: { alert: { title: "a상점이 새해준비상점에 나와요", body: "하트 남겨 두신 브랜드예요. 지도에서 자리를 볼 수 있어요." }, sound: "default" },
      kind: "brand",
      slug: "newyear-store-2026",
      exhibitorIds: ["a"],
      boothId: "booth-a",
    });
  });

  it("여럿이면 목록(exhibitorIds 둘 이상, boothId 없음)", () => {
    const push = buildPush([item({ exhibitorId: "a", boothId: "x" }), item({ exhibitorId: "b" }), item({ exhibitorId: "c" })]);
    expect(push.title).toBe("하트 남긴 브랜드 3곳이 새해준비상점에 나와요");
    expect(push.body).toBe("a상점 외 2곳이에요.");
    expect(push.data).toEqual({ kind: "brand", slug: "newyear-store-2026", exhibitorIds: ["a", "b", "c"] });
  });

  it("박람회가 섞이면 많이 나오는 박람회 목록으로, 제목은 '박람회'", () => {
    const push = buildPush([
      item({ exhibitorId: "a", slug: "sdf-2026", fairName: "서울디자인페스티벌", startDate: "2026-12-17" }),
      item({ exhibitorId: "b" }),
      item({ exhibitorId: "c" }),
    ]);
    expect(push.title).toBe("하트 남긴 브랜드 3곳이 박람회 2곳에 나와요");
    expect(push.data).toEqual({ kind: "brand", slug: "newyear-store-2026", exhibitorIds: ["b", "c"] });
    expect(push.body).toBe("b상점 외 2곳이에요. 다른 박람회는 알림함에 있어요.");
  });

  it("한 브랜드가 두 박람회에 나오면 브랜드는 한 곳으로 센다", () => {
    const push = buildPush([
      item({ exhibitorId: "a" }),
      item({ exhibitorId: "a", exhibitionId: "ex-2", slug: "sdf-2026", fairName: "서울디자인페스티벌", startDate: "2026-12-17" }),
    ]);
    expect(push.title).toBe("a상점이 박람회 2곳에 나와요");
    expect(push.body).toBe("하트 남겨 두신 브랜드예요. 새해준비상점, 서울디자인페스티벌에 나와요.");
    expect(push.data).toEqual({ kind: "brand", slug: "newyear-store-2026", exhibitorIds: ["a"] });
  });
});
