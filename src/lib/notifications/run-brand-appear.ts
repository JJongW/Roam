// 브랜드 알림 잡 — 저장소와 보내기를 붙인다. Vercel Cron(/api/cron/brand-appear)과 드라이런이 부른다.
//
// ① 고르기: 지난번 뒤에 생긴 참가 × 하트 → notification_log에 queued로 넣는다(dedupe_key로 중복은 빠진다).
// ② 보내기: 보내도 되는 시간(한국 10~20시)이면 queued를 사용자마다 하나로 묶어 보낸다.
//    - 박람회가 이미 끝난 줄은 expired.
//    - 기기가 없으면 no_device(알림함엔 보인다).
//    - 오늘 이미 받은 사람은 내일로 남긴다(하루 한 번).
//    - 보내기가 없으면(APNs 미설정) 손대지 않고 queued로 둔다.
// 드라이런(dryRun)은 아무것도 쓰지 않는다. 기준 시각도 옮기지 않는다.
import { randomUUID } from "node:crypto";
import type { Repository } from "@/lib/repositories/types";
import type { NotificationInsert, NotificationLog } from "@/lib/types";
import type { PushResult, PushSender } from "./apns";
import {
  BRAND_APPEAR,
  apnsBody,
  buildPush,
  inSendWindow,
  itemOf,
  kstDay,
  kstDayStartIso,
  matchBrandAppear,
  type BrandAppearPush,
  type MatchSkip,
} from "./brand-appear";

export const BRAND_APPEAR_JOB = "brand_appear";
/** 기준 시각이 없을 때(첫 실행) 얼마나 거슬러 볼지. */
export const DEFAULT_FIRST_LOOKBACK_HOURS = 24;

export interface RunOptions {
  now?: Date;
  /** 없으면 보내지 않고 queued로 둔다. */
  sender?: PushSender | null;
  dryRun?: boolean;
  firstLookbackHours?: number;
  /** 기준 시각을 무시하고 이 시각 뒤 참가를 본다(드라이런 확인용). */
  sinceOverride?: string;
}

export interface PlannedDelivery {
  userId: string;
  devices: number;
  push: BrandAppearPush;
  rows: number;
}

export interface RunReport {
  dryRun: boolean;
  since: string;
  now: string;
  inWindow: boolean;
  senderReady: boolean;
  match: {
    participations: number;
    hearts: number;
    candidates: number;
    /** dedupe_key가 새로 들어간(드라이런이면 들어갈) 줄. */
    inserted: number;
    duplicate: number;
    skipped: { opted_out: number; hearted_after: number };
  };
  deliver: {
    queuedBefore: number;
    sentUsers: number;
    sentRows: number;
    noDeviceRows: number;
    expiredRows: number;
    failedRows: number;
    heldRows: number;
    heldReason: string | null;
    revokedTokens: number;
    planned: PlannedDelivery[];
  };
  /** 드라이런에서 사람이 볼 미리보기(새 줄). */
  preview: NotificationInsert[];
  skippedDetail: MatchSkip[];
}

export async function runBrandAppear(repo: Repository, opts: RunOptions = {}): Promise<RunReport> {
  const now = opts.now ?? new Date();
  const nowIso = now.toISOString();
  const dryRun = opts.dryRun ?? false;
  const today = kstDay(now);

  // ① 고르기
  const cursor = opts.sinceOverride ?? (await repo.getJobCursor(BRAND_APPEAR_JOB));
  const since =
    cursor ?? new Date(now.getTime() - (opts.firstLookbackHours ?? DEFAULT_FIRST_LOOKBACK_HOURS) * 3_600_000).toISOString();
  const participations = await repo.listParticipationsCreatedSince(since, today);
  const exhibitorIds = [...new Set(participations.map((p) => p.exhibitorId))];
  const hearts = exhibitorIds.length ? await repo.listBrandHeartsForExhibitors(exhibitorIds) : [];
  const userIds = [...new Set(hearts.map((h) => h.userId))];
  const [optOuts, brandNames] = await Promise.all([
    userIds.length ? repo.listNotificationOptOuts(BRAND_APPEAR, userIds) : Promise.resolve([]),
    exhibitorIds.length ? repo.getExhibitorNames(exhibitorIds) : Promise.resolve({}),
  ]);
  const { rows, skipped } = matchBrandAppear({ participations, hearts, optedOut: new Set(optOuts), brandNames });

  let insertedRows: NotificationLog[] = [];
  let preview: NotificationInsert[] = [];
  if (dryRun) {
    const existing = new Set(rows.length ? await repo.listExistingNotificationKeys(rows.map((r) => r.dedupeKey)) : []);
    preview = rows.filter((r) => !existing.has(r.dedupeKey));
  } else {
    insertedRows = await repo.insertNotifications(rows);
    // 넣기가 끝난 뒤에만 옮긴다. 넣다가 실패하면 다음 번에 같은 구간을 다시 본다(dedupe_key가 중복을 막는다).
    if (!opts.sinceOverride) await repo.setJobCursor(BRAND_APPEAR_JOB, nowIso);
  }
  const insertedCount = dryRun ? preview.length : insertedRows.length;

  // ② 보내기
  const queued = dryRun
    ? [
        ...(await repo.listQueuedNotifications(BRAND_APPEAR)),
        ...preview.map((r, i): NotificationLog => ({ ...r, id: `dry-${i}`, status: "queued", createdAt: nowIso })),
      ]
    : await repo.listQueuedNotifications(BRAND_APPEAR);
  const deliver = await deliverQueued(repo, queued, { now, sender: opts.sender ?? null, dryRun });

  return {
    dryRun,
    since,
    now: nowIso,
    inWindow: inSendWindow(now),
    senderReady: !!opts.sender,
    match: {
      participations: participations.length,
      hearts: hearts.length,
      candidates: rows.length,
      inserted: insertedCount,
      duplicate: rows.length - insertedCount,
      skipped: {
        opted_out: skipped.filter((s) => s.reason === "opted_out").length,
        hearted_after: skipped.filter((s) => s.reason === "hearted_after").length,
      },
    },
    deliver,
    preview,
    skippedDetail: skipped,
  };
}

async function deliverQueued(
  repo: Repository,
  queued: NotificationLog[],
  opts: { now: Date; sender: PushSender | null; dryRun: boolean },
): Promise<RunReport["deliver"]> {
  const out: RunReport["deliver"] = {
    queuedBefore: queued.length,
    sentUsers: 0,
    sentRows: 0,
    noDeviceRows: 0,
    expiredRows: 0,
    failedRows: 0,
    heldRows: 0,
    heldReason: null,
    revokedTokens: 0,
    planned: [],
  };
  if (queued.length === 0) return out;
  const nowIso = opts.now.toISOString();
  const today = kstDay(opts.now);

  if (!inSendWindow(opts.now)) {
    out.heldRows = queued.length;
    out.heldReason = "조용한 시간(한국 10시~20시 밖)";
    return out;
  }

  // 보내기 전에 박람회가 끝났으면 알릴 이유가 없다.
  const expired = queued.filter((n) => itemOf(n).endDate < today);
  if (expired.length) {
    if (!opts.dryRun) await repo.updateNotifications(expired.map((n) => n.id), { status: "expired" });
    out.expiredRows = expired.length;
  }
  const live = queued.filter((n) => itemOf(n).endDate >= today);
  if (live.length === 0) return out;

  const byUser = new Map<string, NotificationLog[]>();
  for (const n of live) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  const users = [...byUser.keys()];
  const [devices, sentToday] = await Promise.all([
    repo.listActivePushDevices(users),
    repo.listUsersSentSince(BRAND_APPEAR, users, kstDayStartIso(opts.now)),
  ]);
  const devicesBy = new Map<string, typeof devices>();
  for (const d of devices) if (d.userId) devicesBy.set(d.userId, [...(devicesBy.get(d.userId) ?? []), d]);
  const already = new Set(sentToday);

  for (const [userId, rows] of byUser) {
    const ids = rows.map((r) => r.id);
    const mine = devicesBy.get(userId) ?? [];
    const batchId = randomUUID();
    // 기기가 없으면 푸시 없이 알림함에만 둔다. 하루 한 번 제한은 푸시에만 건다.
    if (mine.length === 0) {
      if (!opts.dryRun) await repo.updateNotifications(ids, { status: "no_device", batchId });
      out.noDeviceRows += rows.length;
      continue;
    }
    if (already.has(userId)) {
      out.heldRows += rows.length;
      out.heldReason ??= "오늘 이미 보낸 사람은 내일로";
      continue;
    }
    const push = buildPush(rows.map(itemOf));
    if (opts.dryRun || !opts.sender) {
      out.planned.push({ userId, devices: mine.length, push, rows: rows.length });
      if (!opts.sender && !opts.dryRun) {
        out.heldRows += rows.length;
        out.heldReason ??= "APNs 미설정";
      }
      continue;
    }
    const results: PushResult[] = [];
    for (const d of mine) {
      const r = await opts.sender.send(
        { token: d.token, environment: d.environment },
        {
          body: apnsBody(push),
          collapseId: batchId,
          // 하루 안에 못 닿으면 버린다(다음 날은 알림함에서 본다).
          expiresAt: Math.floor(opts.now.getTime() / 1000) + 86_400,
        },
      );
      results.push(r);
      if (!r.ok && r.tokenDead) {
        await repo.revokePushDevice(d.token);
        out.revokedTokens++;
      }
    }
    if (results.some((r) => r.ok)) {
      await repo.updateNotifications(ids, { status: "sent", batchId, sentAt: nowIso, error: null });
      out.sentUsers++;
      out.sentRows += rows.length;
      continue;
    }
    const fails = results.filter((r): r is Extract<PushResult, { ok: false }> => !r.ok);
    const reason = fails.map((f) => f.reason).join(", ").slice(0, 400);
    if (fails.every((f) => f.tokenDead)) {
      await repo.updateNotifications(ids, { status: "no_device", batchId, error: reason });
      out.noDeviceRows += rows.length;
    } else if (fails.some((f) => f.retryable)) {
      // 사용자 탓이 아닌 실패(키, 429, 5xx, 연결)는 다음 번에 다시. 박람회가 끝나면 expired로 빠진다.
      await repo.updateNotifications(ids, { status: "queued", error: reason });
      out.heldRows += rows.length;
      out.heldReason ??= "일시 실패, 다음 번에 다시";
    } else {
      await repo.updateNotifications(ids, { status: "failed", batchId, error: reason });
      out.failedRows += rows.length;
    }
  }
  return out;
}
