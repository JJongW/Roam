/**
 * 브랜드 알림 드라이런 — 누가 무엇을 받을지 찍는다. **쓰지도 보내지도 않는다.**
 *
 *   npm run brand-appear:dry-run -- [--since <ISO>] [--days <N>] [--now <ISO>] [--json <보고서.json>]
 *
 * - 운영(읽기 전용): `.env`를 이 체크아웃, 없으면 본 체크아웃에서 읽는다(intake:dry-run과 같은 길). 값은 출력하지 않는다.
 * - `--since`: 이 시각 뒤에 생긴 참가를 본다. `--days N`은 N일 전부터. 둘 다 없으면 잡 기준 시각(없으면 24시간 전).
 * - `--now`: 이 시각인 것처럼(조용한 시간 확인용). 기본은 지금.
 * - 0071이 아직 운영에 없으면 알림 표(notification_*)는 비어 있다고 보고 계속한다.
 * - 저장소의 쓰기 메서드를 막아 두었다. 불리면 멈춘다.
 * - APNs는 아예 만들지 않는다. 사용자 id는 앞 8자만 찍는다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

function findEnvPath(): string {
  const local = resolve(".env");
  if (existsSync(local)) return local;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  const main = join(dirname(common), ".env");
  if (existsSync(main)) return main;
  throw new Error(".env를 찾지 못했어요(이 체크아웃과 본 체크아웃 모두)");
}
loadEnv({ path: findEnvPath(), quiet: true });
process.env.ROAM_WORKER = "1";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const one = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const now = one("--now") ? new Date(one("--now")!) : new Date();
const days = one("--days");
const since = one("--since") ?? (days ? new Date(now.getTime() - Number(days) * 86_400_000).toISOString() : undefined);
const jsonOut = one("--json");

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
const { runBrandAppear } = await import("@/lib/notifications/run-brand-appear");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 드라이런이 아니라 멈춰요");
  process.exit(1);
}

const WRITES = new Set([
  "insertNotifications",
  "updateNotifications",
  "setJobCursor",
  "revokePushDevice",
  "setNotificationPref",
  "markNotificationsRead",
]);
/** 0071 적용 전이면 비어 있다고 보는 읽기. */
const NOTIF_READS: Record<string, unknown> = {
  getJobCursor: null,
  listNotificationOptOuts: [],
  listExistingNotificationKeys: [],
  listQueuedNotifications: [],
  listUsersSentSince: [],
};
const missingTables = new Set<string>();
const real = await getRepository();
const repo = new Proxy(real, {
  get(target, prop, receiver) {
    const v = Reflect.get(target, prop, receiver);
    if (typeof prop !== "string" || typeof v !== "function") return v;
    if (WRITES.has(prop)) return () => Promise.reject(new Error(`드라이런에서 쓰기(${prop})가 불렸어요. 멈춰요`));
    if (prop in NOTIF_READS)
      return async (...args: unknown[]) => {
        try {
          return await v.apply(target, args);
        } catch (e) {
          const m = e instanceof Error ? e.message : String(e);
          if (/notification_|schema cache|does not exist|PGRST205|42P01/i.test(m)) {
            missingTables.add(prop);
            return NOTIF_READS[prop];
          }
          throw e;
        }
      };
    return v.bind(target);
  },
});

const r = await runBrandAppear(repo, { dryRun: true, now, sinceOverride: since, sender: null });
const short = (id: string) => id.slice(0, 8);

console.log(`브랜드 알림 드라이런 (보내지 않음)`);
console.log(`  기준: ${r.since} 뒤에 생긴 참가 / 지금 ${r.now} (보내는 시간 안: ${r.inWindow ? "예" : "아니요"})`);
if (missingTables.size) console.log(`  ! 0071 미적용으로 보여요. 알림 표는 비어 있다고 봤어요(${[...missingTables].join(", ")})`);
console.log(
  `  새 참가 ${r.match.participations}건, 그 브랜드 하트 ${r.match.hearts}개 → 후보 ${r.match.candidates}줄, ` +
    `새로 넣을 줄 ${r.match.inserted}, 이미 있음 ${r.match.duplicate}, 그중 알림 끈 사람(알림함만) ${r.match.muted}, 참가 뒤 하트 ${r.match.skipped.hearted_after}`,
);
const d = r.deliver;
console.log(
  `  보내기: 대기 ${d.queuedBefore}줄 → 푸시 ${d.planned.length}명, 알림 끔(알림함만) ${d.mutedRows}줄, 기기 없음 ${d.noDeviceRows}줄, 끝난 박람회 ${d.expiredRows}줄, ` +
    `남김 ${d.heldRows}줄${d.heldReason ? `(${d.heldReason})` : ""}`,
);
for (const n of r.preview) console.log(`  · 알림함 ${short(n.userId)}  ${n.title} / ${n.body}`);
for (const p of d.planned)
  console.log(`  → 푸시 ${short(p.userId)} 기기 ${p.devices}대, ${p.rows}줄 묶음: ${p.push.title} / ${p.push.body}  ${JSON.stringify(p.push.data)}`);

if (jsonOut) {
  const safe = {
    ...r,
    preview: r.preview.map((n) => ({ ...n, userId: short(n.userId), dedupeKey: undefined })),
    skippedDetail: r.skippedDetail.map((s) => ({ ...s, userId: short(s.userId) })),
    deliver: { ...d, planned: d.planned.map((p) => ({ ...p, userId: short(p.userId) })) },
    missingTables: [...missingTables],
  };
  writeFileSync(jsonOut, `${JSON.stringify(safe, null, 2)}\n`);
  console.log(`  보고서 → ${jsonOut}`);
}
