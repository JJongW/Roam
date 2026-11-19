/**
 * 허락 받은 브랜드 사진 올리기 계획 — 순수. 파일을 읽거나 DB에 쓰지 않는다(scripts/brand-photos.ts가 한다).
 *
 * 2026-11-19 Ted: 브랜드 아티클 사진은 카드뉴스용으로 허락받은 사진을 쓴다. 겨울 문구전부터.
 * 아티클(lib/articles/facts.ts permittedPhotos)이 사진을 쓰려면 둘 다 있어야 한다.
 *   1. 브랜드 대표 사진 칸(brand_profile_field photos)이 사람이 확인한 상태(reviewed)
 *   2. 그 박람회 참가의 허락(participant_permission)이 granted나 partial이고 allowedUse에 account-photo나 sent-photo
 * 이 모듈은 사진 목록(manifest, 경로와 해시)과 운영 상태를 받아 무엇을 올리고 무엇을 쓸지 정한다.
 *
 * 규칙
 * - 빈 칸만 채운다. 운영 사진 칸에 다른 값이 있으면 conflict로 빼고 덮지 않는다(인입과 같은 규칙).
 * - 허락은 아직 보내지 않음(not-sent)이거나 행이 없을 때만 쓴다. 다른 상태가 있으면 conflict.
 * - 참가 사실이 없으면 허락은 쓰지 못한다(no-participant). 사진 칸은 브랜드 단위라 먼저 써도 된다.
 * - 해시가 다르거나 파일이 없으면 그 팀은 아무것도 하지 않는다(error).
 */
import { z } from "zod";
import { brandKeyIdentity, identityKeys } from "@/lib/exhibitor/identity";
import type { ExhibitorGraph, ProfileField } from "@/lib/types";

export const PHOTO_MANIFEST_VERSION = "brand-photos.v1";

const photoSchema = z
  .object({
    file: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    bytes: z.number().int().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    use: z.boolean(),
    note: z.string().optional(),
  })
  .strict();

const teamSchema = z
  .object({
    key: z.string().min(1),
    name: z.string().min(1),
    artist: z.string().min(1),
    instagramUrl: z.string().url().optional(),
    exhibitorId: z.string().min(1).optional(),
    officialBooth: z.string().optional(),
    day: z.string().optional(),
    boothcutUrl: z.string().url().optional(),
    folder: z.string().min(1),
    /** 사진 칸 scope 원문(profile.ts 200자). */
    scope: z.string().trim().min(1).max(200),
    permission: z
      .object({
        status: z.enum(["granted", "partial"]),
        allowedUse: z.array(z.string().regex(/^[a-z0-9-]{1,40}$/)).min(1),
        sentAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        reply: z.string().max(1000),
        photoSource: z.string().max(1000),
      })
      .strict(),
    photos: z.array(photoSchema).min(1),
  })
  .strict();

export const photoManifestSchema = z
  .object({
    version: z.literal(PHOTO_MANIFEST_VERSION),
    exhibitionSlug: z.string().min(1),
    bucket: z.string().regex(/^[a-z0-9-]{3,63}$/),
    root: z.string().min(1),
    evidence: z.string().min(1),
    scannedAt: z.string(),
    teams: z.array(teamSchema).min(1),
  })
  .strict();
export type PhotoManifest = z.infer<typeof photoManifestSchema>;
export type PhotoTeam = PhotoManifest["teams"][number];

/** 저장소 열쇠. 내용 해시로 지어 같은 사진은 다시 돌려도 같은 자리다. */
/**
 * 이보다 큰 원본은 올리기 전에 줄인다(긴 변 RESIZE.maxEdge, JPEG 품질 RESIZE.quality). 디스크 원본은 그대로 둔다.
 * 고토 PNG 두 장이 8.5MB대다. 앱 사진 칸(3:4 넘김)에 그 크기는 필요 없다.
 */
export const RESIZE_OVER_BYTES = 8_000_000;
export const RESIZE = { maxEdge: 2400, quality: 85 } as const;
export const needsResize = (p: { bytes: number }) => p.bytes > RESIZE_OVER_BYTES;

/** 저장소 열쇠. 원본 내용 해시로 지어 같은 사진은 다시 돌려도 같은 자리다. 줄여 올리는 사진은 .jpg. */
export function storageKey(slug: string, exhibitorId: string, p: { file: string; sha256: string; bytes?: number }): string {
  const ext = p.bytes !== undefined && needsResize({ bytes: p.bytes }) ? "jpg" : (p.file.split(".").pop() ?? "jpg").toLowerCase().replace("jpeg", "jpg");
  return `${slug}/${exhibitorId}/${p.sha256.slice(0, 16)}.${ext}`;
}

export function contentType(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/** exFAT가 만드는 AppleDouble(._*)과 숨김 파일, 소개.md 같은 글은 사진이 아니다. */
export function isPhotoFile(name: string): boolean {
  return !name.startsWith(".") && /\.(jpe?g|png|webp)$/i.test(name);
}

export interface DiskFile {
  sha256: string;
  bytes: number;
}

export interface PlanInput {
  manifest: PhotoManifest;
  graph: ExhibitorGraph;
  /** 그 행사 id. 운영에 행사 행이 없으면 null. */
  exhibitionId: string | null;
  fields: ProfileField[];
  /** 참가 id → 현재 허락(행이 있을 때만). */
  permissions: Record<string, { status: string; allowedUse: string[] }>;
  /** `<folder>/<file>`(NFC) → 디스크에서 잰 값. 없으면 디스크에 없는 것. */
  disk: Map<string, DiskFile>;
  /** 열쇠 → 공개 주소. */
  publicUrl: (key: string) => string;
  /** 디스크 폴더에 있는데 manifest에 없는 사진(`<folder>/<file>`). 경고로만 보인다. */
  extraOnDisk?: string[];
}

export interface TeamPlan {
  key: string;
  name: string;
  exhibitorId: string | null;
  participantId: string | null;
  uploads: { file: string; key: string; url: string; contentType: string; bytes: number; resize: boolean }[];
  photosField: { action: "fill" | "same" | "conflict" | "none"; value: { path: string; scope: string }[]; current?: unknown };
  permission: {
    action: "write" | "same" | "conflict" | "no-participant" | "no-exhibition" | "skip";
    patch: { status: "granted" | "partial"; allowedUse: string[]; sentAt: string; reply: string; photoSource: string; notes: string };
    current?: { status: string; allowedUse: string[] };
  };
  errors: string[];
  warnings: string[];
}

const nfc = (s: string) => s.normalize("NFC");
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function planPhotoIntake(input: PlanInput): TeamPlan[] {
  const { manifest, graph } = input;
  const byKey = new Map<string, Set<string>>();
  for (const ex of graph.exhibitors)
    for (const k of [...identityKeys(ex), ...(ex.brandKeys ?? []).map(brandKeyIdentity)])
      (byKey.get(k) ?? byKey.set(k, new Set()).get(k)!).add(ex.id);
  const exists = new Set(graph.exhibitors.map((e) => e.id));
  const fieldById = new Map(input.fields.map((f) => [f.id, f]));

  return manifest.teams.map((t): TeamPlan => {
    const errors: string[] = [];
    const warnings: string[] = [];
    // 브랜드: 적어 둔 id가 있으면 그것(운영에 있어야 한다), 인스타가 다른 브랜드를 가리키면 멈춘다.
    const byIg = new Set(t.instagramUrl ? identityKeys({ instagramUrl: t.instagramUrl }).flatMap((k) => [...(byKey.get(k) ?? [])]) : []);
    let exhibitorId: string | null = null;
    if (t.exhibitorId) {
      if (!exists.has(t.exhibitorId)) errors.push(`적어 둔 브랜드 ${t.exhibitorId}가 운영에 없어요`);
      else if (byIg.size && !byIg.has(t.exhibitorId)) errors.push(`인스타가 다른 브랜드(${[...byIg].join(", ")})를 가리켜요`);
      else exhibitorId = t.exhibitorId;
    } else if (byIg.size === 1) exhibitorId = [...byIg][0];
    else errors.push(byIg.size > 1 ? `인스타로 브랜드가 ${byIg.size}곳 나와요(중복)` : "운영에서 브랜드를 찾지 못했어요");

    const participant =
      exhibitorId && input.exhibitionId
        ? graph.participants.filter((p) => p.exhibitorId === exhibitorId && p.exhibitionId === input.exhibitionId)
        : [];
    if (participant.length > 1) errors.push(`이 행사 참가 사실이 ${participant.length}개예요`);
    const participantId = participant.length === 1 ? participant[0].id : null;

    const chosen = t.photos.filter((p) => p.use);
    for (const p of t.photos) {
      const d = input.disk.get(nfc(`${t.folder}/${p.file}`));
      if (!d) {
        if (p.use) errors.push(`디스크에 없어요: ${p.file}`);
        continue;
      }
      if (d.sha256 !== p.sha256 || d.bytes !== p.bytes) errors.push(`해시나 크기가 manifest와 달라요: ${p.file}`);
    }
    for (const x of input.extraOnDisk ?? []) if (nfc(x).startsWith(nfc(`${t.folder}/`))) warnings.push(`manifest에 없는 사진이 디스크에 있어요: ${x}`);
    if (!chosen.length) warnings.push("고른 사진(use: true)이 없어요. 사진 칸은 쓰지 않아요");
    if (chosen.length > 20) errors.push("사진 칸은 20장까지예요");

    const uploads = exhibitorId
      ? chosen.map((p) => {
          const key = storageKey(manifest.exhibitionSlug, exhibitorId!, p);
          const resize = needsResize(p);
          return { file: p.file, key, url: input.publicUrl(key), contentType: resize ? "image/jpeg" : contentType(p.file), bytes: p.bytes, resize };
        })
      : [];
    const value = uploads.map((u) => ({ path: u.url, scope: t.scope }));

    const cur = exhibitorId ? fieldById.get(`ex:${exhibitorId}:photos`) : undefined;
    const curEmpty = !cur || !Array.isArray(cur.value) || cur.value.length === 0;
    const photosField: TeamPlan["photosField"] = !chosen.length
      ? { action: "none", value: [] }
      : curEmpty
        ? { action: "fill", value }
        : sameJson(cur!.value, value) && cur!.status === "reviewed"
          ? { action: "same", value }
          : { action: "conflict", value, current: cur!.value };

    const patch = {
      status: t.permission.status,
      allowedUse: t.permission.allowedUse,
      sentAt: t.permission.sentAt,
      reply: t.permission.reply,
      photoSource: t.permission.photoSource,
      notes: `${manifest.evidence}에서 옮김. 작가 ${t.artist}, 부스 ${t.officialBooth ?? "미정"}`.slice(0, 4000),
    };
    const curPerm = participantId ? input.permissions[participantId] : undefined;
    const permission: TeamPlan["permission"] = !input.exhibitionId
      ? { action: "no-exhibition", patch }
      : !participantId
        ? { action: "no-participant", patch }
        : !curPerm || curPerm.status === "not-sent"
          ? { action: "write", patch, ...(curPerm ? { current: curPerm } : {}) }
          : curPerm.status === patch.status && sameJson([...curPerm.allowedUse].sort(), [...patch.allowedUse].sort())
            ? { action: "same", patch, current: curPerm }
            : { action: "conflict", patch, current: curPerm };

    // 오류가 하나라도 있으면 그 팀은 아무것도 쓰지 않는다.
    if (errors.length)
      return { key: t.key, name: t.name, exhibitorId, participantId, uploads: [], photosField: { action: "none", value: [] }, permission: { action: "skip", patch }, errors, warnings };
    return { key: t.key, name: t.name, exhibitorId, participantId, uploads, photosField, permission, errors, warnings };
  });
}

/** 아티클이 이 팀 사진을 쓸 수 있게 되나(사진 칸 + 회차 허락이 둘 다 서나). */
export function articleReady(p: TeamPlan): boolean {
  const photoOk = p.photosField.action === "fill" || p.photosField.action === "same";
  const permOk = p.permission.action === "write" || (p.permission.action === "same" && !!p.participantId);
  return !p.errors.length && photoOk && permOk;
}
