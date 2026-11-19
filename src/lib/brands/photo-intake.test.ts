import { describe, expect, it } from "vitest";
import { articleReady, isPhotoFile, photoManifestSchema, planPhotoIntake, storageKey, type PhotoManifest } from "./photo-intake";
import type { ExhibitorGraph, ProfileField } from "@/lib/types";

const SHA = "a".repeat(64);
const manifest = (over: Partial<PhotoManifest["teams"][number]> = {}): PhotoManifest =>
  photoManifestSchema.parse({
    version: "brand-photos.v1",
    exhibitionSlug: "moongu-2026-winter",
    bucket: "brand-photos",
    root: "/Volumes/x",
    evidence: "permissions.csv",
    scannedAt: "2026-11-19",
    teams: [
      {
        key: "moongu-odd_tail",
        name: "Odd Tail",
        artist: "mika99",
        instagramUrl: "https://www.instagram.com/odd_tail/",
        exhibitorId: "ex1",
        folder: "mika99 - odd_tail",
        scope: "sent-photo",
        permission: { status: "granted", allowedUse: ["sent-photo"], sentAt: "2026-11-03", reply: "사진 보냄", photoSource: "/Volumes/x" },
        photos: [
          { file: "a.JPG", sha256: SHA, bytes: 10, width: 1080, height: 1350, use: true },
          { file: "b.JPG", sha256: SHA, bytes: 10, width: 400, height: 400, use: false },
        ],
        ...over,
      },
    ],
  });

const graph = (participants: ExhibitorGraph["participants"] = []): ExhibitorGraph => ({
  exhibitors: [{ id: "ex1", canonicalName: "Odd Tail", instagramUrl: "https://instagram.com/odd_tail" }],
  participants,
  assignments: [],
  candidates: [],
});
const disk = new Map([["mika99 - odd_tail/a.JPG", { sha256: SHA, bytes: 10 }]]);
const base = { fields: [] as ProfileField[], permissions: {}, disk, publicUrl: (k: string) => `https://cdn.test/${k}` };

describe("planPhotoIntake", () => {
  it("행사가 없으면 사진 칸만 채우고 허락은 못 쓴다", () => {
    const [p] = planPhotoIntake({ ...base, manifest: manifest(), graph: graph(), exhibitionId: null });
    expect(p.errors).toEqual([]);
    expect(p.uploads.map((u) => u.key)).toEqual([storageKey("moongu-2026-winter", "ex1", { file: "a.JPG", sha256: SHA })]);
    expect(p.photosField).toMatchObject({ action: "fill", value: [{ path: expect.stringContaining("https://cdn.test/moongu-2026-winter/ex1/"), scope: "sent-photo" }] });
    expect(p.permission.action).toBe("no-exhibition");
    expect(articleReady(p)).toBe(false);
  });

  it("참가 사실이 있으면 허락을 쓰고 아티클에 쓸 수 있게 된다", () => {
    const [p] = planPhotoIntake({ ...base, manifest: manifest(), graph: graph([{ id: "pt1", exhibitorId: "ex1", exhibitionId: "fair", displayName: "Odd Tail" }]), exhibitionId: "fair" });
    expect(p.permission).toMatchObject({ action: "write", patch: { status: "granted", allowedUse: ["sent-photo"], sentAt: "2026-11-03" } });
    expect(articleReady(p)).toBe(true);
  });

  it("운영 사진 칸에 다른 값이 있으면 덮지 않는다", () => {
    const fields = [{ id: "ex:ex1:photos", exhibitorId: "ex1", participantId: null, field: "photos", value: [{ path: "/old.jpg", scope: "x" }], sources: [], status: "collected" } as unknown as ProfileField];
    const [p] = planPhotoIntake({ ...base, fields, manifest: manifest(), graph: graph(), exhibitionId: null });
    expect(p.photosField.action).toBe("conflict");
  });

  it("이미 다른 허락 상태가 있으면 conflict", () => {
    const [p] = planPhotoIntake({
      ...base,
      permissions: { pt1: { status: "declined", allowedUse: [] } },
      manifest: manifest(),
      graph: graph([{ id: "pt1", exhibitorId: "ex1", exhibitionId: "fair", displayName: "Odd Tail" }]),
      exhibitionId: "fair",
    });
    expect(p.permission.action).toBe("conflict");
  });

  it("해시가 다르면 그 팀은 아무것도 하지 않는다", () => {
    const bad = new Map([["mika99 - odd_tail/a.JPG", { sha256: "b".repeat(64), bytes: 10 }]]);
    const [p] = planPhotoIntake({ ...base, disk: bad, manifest: manifest(), graph: graph(), exhibitionId: null });
    expect(p.errors[0]).toContain("해시");
    expect(p.uploads).toEqual([]);
    expect(p.permission.action).toBe("skip");
  });

  it("적어 둔 브랜드와 인스타가 가리키는 브랜드가 다르면 멈춘다", () => {
    const [p] = planPhotoIntake({ ...base, manifest: manifest({ exhibitorId: "ex2" }), graph: { ...graph(), exhibitors: [...graph().exhibitors, { id: "ex2", canonicalName: "다른" }] }, exhibitionId: null });
    expect(p.errors[0]).toContain("인스타");
  });

  it("manifest 폴더 이름이 NFD여도 NFC 디스크 열쇠로 찾는다", () => {
    const m = manifest({ folder: "슈미" });
    const d = new Map([["슈미/a.JPG", { sha256: SHA, bytes: 10 }]]);
    const [p] = planPhotoIntake({ ...base, disk: d, manifest: m, graph: graph(), exhibitionId: null });
    expect(p.errors).toEqual([]);
  });
});

describe("isPhotoFile", () => {
  it("exFAT AppleDouble과 글 파일을 거른다", () => {
    expect(["1.png", "._1.png", "소개.md", "._소개.md", "A.JPG", "x.jpeg"].filter(isPhotoFile)).toEqual(["1.png", "A.JPG", "x.jpeg"]);
  });
});
