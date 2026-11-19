// 브랜드 알림 "하트 남긴 브랜드가 다음 박람회에 나와요" — 순수 규칙(고르기, 묶기, 문구, 페이로드).
// 저장소와 APNs는 run-brand-appear.ts가 붙인다. 결정 기록: docs/decisions/2026-11-19_브랜드-알림-서버.md
//
// - 고르기: 새로 생긴 참가 × 그 브랜드에 하트를 남긴 사용자. 끈 사람과, 참가가 생긴 뒤에 하트를
//   남긴 사람(그 박람회를 보고 남긴 하트)은 뺀다.
// - 한 줄 = (사용자, 브랜드, 박람회). dedupe_key로 다시 알리지 않는다.
// - 푸시는 사용자마다 하루 한 번: 하나면 그 브랜드, 여럿이면 목록(iOS PushLanding, 11-13).
// - 보내는 시간은 한국 시각 10시부터 20시 전까지. 그 밖이면 줄만 쌓아 둔다(queued).
import { josa } from "@/lib/articles/korean";
import type { BrandHeart, NewParticipation, NotificationInsert, NotificationLog } from "@/lib/types";

export const BRAND_APPEAR = "brand_appear" as const;
/** 한 푸시 목록에 싣는 브랜드 수 상한. APNs 페이로드 4KB 안에 넉넉히 들어간다. */
export const MAX_LIST_IDS = 50;
export const SEND_START_HOUR_KST = 10;
export const SEND_END_HOUR_KST = 20;

// --- 시각 -------------------------------------------------------------------

const KST_MS = 9 * 3_600_000;

/** 한국 날짜 YYYY-MM-DD. */
export function kstDay(d: Date): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}

/** 한국 날짜가 시작한 순간(UTC ISO). "오늘 이미 보냈나"의 기준. */
export function kstDayStartIso(d: Date): string {
  return new Date(Date.parse(`${kstDay(d)}T00:00:00Z`) - KST_MS).toISOString();
}

export function kstHour(d: Date): number {
  return new Date(d.getTime() + KST_MS).getUTCHours();
}

/** 보내도 되는 시간인가(한국 시각 10:00 ≤ t < 20:00). */
export function inSendWindow(d: Date): boolean {
  const h = kstHour(d);
  return h >= SEND_START_HOUR_KST && h < SEND_END_HOUR_KST;
}

// --- 키와 문구 ----------------------------------------------------------------

export function dedupeKey(userId: string, exhibitorId: string, exhibitionId: string): string {
  return `${BRAND_APPEAR}:${userId}:${exhibitorId}:${exhibitionId}`;
}

/** 알림함 한 줄과 하나짜리 푸시의 문구. 부스가 있을 때만 지도 이야기를 한다. */
export function singleCopy(brand: string, fair: string, hasBooth: boolean): { title: string; body: string } {
  const subject = josa(brand, "subject");
  // 영문으로 끝나 받침을 모르면 "브랜드"를 붙여 "가"로 고정한다("이(가)" 병기 대신, 브랜드 검토 11-19).
  const title = `${subject ?? `${brand} 브랜드가`} ${fair}에 나와요`;
  const body = hasBooth ? "하트 남겨 두신 브랜드예요. 지도에서 자리를 볼 수 있어요." : "하트 남겨 두신 브랜드예요.";
  return { title, body };
}

/**
 * 여럿을 한 번에 보내는 푸시의 문구. 브랜드는 exhibitorId로 중복 없이 센다(한 브랜드가 두 박람회에
 * 나오면 한 곳으로 센다, 브랜드 검토 11-19). brands는 [id, 이름] 순서대로, 첫 이름을 본문에 쓴다.
 */
export function listCopy(brands: [string, string][], fairs: string[]): { title: string; body: string } {
  const unique = [...new Map(brands).entries()];
  const n = unique.length;
  const m = fairs.length;
  if (n === 1) {
    const [, name] = unique[0];
    const subject = josa(name, "subject") ?? `${name} 브랜드가`;
    return { title: `${subject} 박람회 ${m}곳에 나와요`, body: `하트 남겨 두신 브랜드예요. ${fairs.join(", ")}에 나와요.` };
  }
  return {
    title: m === 1 ? `하트 남긴 브랜드 ${n}곳이 ${fairs[0]}에 나와요` : `하트 남긴 브랜드 ${n}곳이 박람회 ${m}곳에 나와요`,
    body: m === 1 ? `${unique[0][1]} 외 ${n - 1}곳이에요.` : `${unique[0][1]} 외 ${n - 1}곳이에요. 다른 박람회는 알림함에 있어요.`,
  };
}

// --- 고르기 -------------------------------------------------------------------

/** 알림 한 줄의 payload(알림함과 묶기에 쓴다). iOS가 읽는 키는 buildPushPayload가 만든다. */
export interface BrandAppearItem {
  exhibitorId: string;
  brandName: string;
  exhibitionId: string;
  slug: string;
  fairName: string;
  startDate: string;
  endDate: string;
  boothId?: string;
  participantId: string;
}

export interface MatchInput {
  participations: NewParticipation[];
  hearts: BrandHeart[];
  /** 브랜드 알림을 끈 사용자. */
  optedOut: Set<string>;
  /** exhibitor id → 브랜드 이름(canonical_name). 없으면 참가 표기 이름. */
  brandNames: Record<string, string>;
}

export interface MatchSkip {
  userId: string;
  exhibitorId: string;
  exhibitionId: string;
  reason: "opted_out" | "hearted_after";
}

/** 새 참가 × 하트 → 넣을 줄. 같은 (사용자, 브랜드, 박람회)는 한 번만. */
export function matchBrandAppear(input: MatchInput): { rows: NotificationInsert[]; skipped: MatchSkip[] } {
  const heartsBy = new Map<string, BrandHeart[]>();
  for (const h of input.hearts) {
    const list = heartsBy.get(h.exhibitorId) ?? [];
    list.push(h);
    heartsBy.set(h.exhibitorId, list);
  }
  const rows: NotificationInsert[] = [];
  const skipped: MatchSkip[] = [];
  const seen = new Set<string>();
  for (const p of input.participations) {
    for (const h of heartsBy.get(p.exhibitorId) ?? []) {
      const key = dedupeKey(h.userId, p.exhibitorId, p.exhibition.id);
      if (seen.has(key)) continue;
      seen.add(key);
      const base = { userId: h.userId, exhibitorId: p.exhibitorId, exhibitionId: p.exhibition.id };
      if (input.optedOut.has(h.userId)) {
        skipped.push({ ...base, reason: "opted_out" });
        continue;
      }
      // 참가가 생긴 뒤에 남긴 하트는 그 박람회 명단을 보고 남긴 것이다. 이미 아는 소식이라 알리지 않는다.
      if (h.createdAt > p.createdAt) {
        skipped.push({ ...base, reason: "hearted_after" });
        continue;
      }
      const brandName = input.brandNames[p.exhibitorId] || p.displayName;
      const item: BrandAppearItem = {
        exhibitorId: p.exhibitorId,
        brandName,
        exhibitionId: p.exhibition.id,
        slug: p.exhibition.slug,
        fairName: p.exhibition.name,
        startDate: p.exhibition.startDate,
        endDate: p.exhibition.endDate,
        participantId: p.participantId,
        ...(p.booth ? { boothId: p.booth.id } : {}),
      };
      const copy = singleCopy(brandName, p.exhibition.name, !!p.booth);
      rows.push({
        userId: h.userId,
        kind: BRAND_APPEAR,
        title: copy.title,
        body: copy.body,
        payload: { ...item },
        dedupeKey: key,
      });
    }
  }
  return { rows, skipped };
}

// --- 묶기와 페이로드 -------------------------------------------------------------

export function itemOf(n: Pick<NotificationLog, "payload">): BrandAppearItem {
  return n.payload as unknown as BrandAppearItem;
}

/**
 * iOS가 읽는 푸시(Roam-ios PushCenter.swift `PushLanding(userInfo:)`).
 * - kind는 "brand"다. 설정 이름(PushPref.brandAppear = "brand_appear")과 다르다. iOS가 "brand"만 받는다.
 * - slug 필수. exhibitorIds가 둘 이상이면 목록(brandList), 하나면 그 부스(brand, boothId 선택).
 * - 박람회가 여럿 섞이면 iOS는 slug 하나만 받으므로, 가장 많이 나오는 박람회(같으면 먼저 여는 곳)를 고른다.
 *   다른 박람회 줄은 알림함에서 본다.
 */
export interface BrandAppearPush {
  title: string;
  body: string;
  /** aps 밖에 싣는 키(userInfo). */
  data: { kind: "brand"; slug: string; exhibitorIds: string[]; boothId?: string };
}

export function buildPush(items: BrandAppearItem[]): BrandAppearPush {
  if (items.length === 0) throw new Error("빈 묶음은 보낼 수 없어요");
  const bySlug = new Map<string, BrandAppearItem[]>();
  for (const it of items) bySlug.set(it.slug, [...(bySlug.get(it.slug) ?? []), it]);
  const [landing] = [...bySlug.values()].sort(
    (a, b) => b.length - a.length || a[0].startDate.localeCompare(b[0].startDate) || a[0].slug.localeCompare(b[0].slug),
  );
  if (items.length === 1) {
    const it = items[0];
    return {
      ...singleCopy(it.brandName, it.fairName, !!it.boothId),
      data: { kind: "brand", slug: it.slug, exhibitorIds: [it.exhibitorId], ...(it.boothId ? { boothId: it.boothId } : {}) },
    };
  }
  const fairs = [...new Set(items.map((i) => i.fairName))];
  // 첫 이름은 목록에 실리는 박람회 쪽에서 고른다(눌러서 바로 보이게).
  const names: [string, string][] = [landing[0], ...items.filter((i) => i !== landing[0])].map((i) => [i.exhibitorId, i.brandName]);
  const ids = [...new Set(landing.map((i) => i.exhibitorId))].slice(0, MAX_LIST_IDS);
  const data: BrandAppearPush["data"] =
    ids.length === 1
      ? { kind: "brand", slug: landing[0].slug, exhibitorIds: ids, ...(landing[0].boothId ? { boothId: landing[0].boothId } : {}) }
      : { kind: "brand", slug: landing[0].slug, exhibitorIds: ids };
  return { ...listCopy(names, fairs), data };
}

/** APNs 본문. 사용자 키는 aps 밖 최상위에 둔다(iOS userInfo["kind"] 등). */
export function apnsBody(push: BrandAppearPush): Record<string, unknown> {
  return {
    aps: { alert: { title: push.title, body: push.body }, sound: "default" },
    ...push.data,
  };
}
