/**
 * 브랜드 소개 다시 만들기 — 이미 저장된 Roam 소개(brand_profile_field intro.display)를 새 지침(2026-11-28)으로
 * 다시 쓴다. Ted가 손으로 돌린다. 워커와 cron에 넣지 않는다. 결정 기록: docs/decisions/2026-11-28_브랜드-소개-정돈.md.
 *
 *   # 드라이런(기본): 운영은 읽기만. 백업을 뜨고, 모델로 새 소개를 만들어 전후를 파일로 낸다(운영에 안 씀)
 *   npm run brand-intro:retidy -- --slug newyear-store-2026
 *   npm run brand-intro:retidy                       # 전체(새해 준비상점 → 다가오는 박람회 → 나머지 순)
 *   npm run brand-intro:retidy -- --limit 20         # 앞에서 20곳만(표본)
 *   # 적용: 드라이런이 낸 계획 파일 그대로 쓴다(모델을 다시 부르지 않는다). 범위(slug 또는 all)를 입력해 확인
 *   npm run brand-intro:retidy -- --apply --plan data/intake/_backup/brand-intro-retidy-plan-<시각>.json
 *   echo newyear-store-2026 | npm run brand-intro:retidy -- --apply --plan <계획 파일>     # 확인을 파이프로
 *   # 되돌리기: 적용 직전 백업(apply-before)을 그대로 되쓴다. "restore"를 입력해 확인
 *   echo restore | npm run brand-intro:retidy -- --restore data/intake/_backup/brand-intro-retidy-apply-before-<시각>.json
 *
 * 무엇을 쓰나(계획의 decision)
 *   write     새 소개가 게이트를 넘음 → collected로 앱에 보인다
 *   tidy      새 소개는 못 넘었지만 지금 보이는 소개를 정돈한 것(intro-tidy)이 넘음 → collected
 *   draft     지금도 앱에 안 보이는 칸(ai_draft, 원문만 있는 collected)인데 새 소개가 못 넘음 → ai_draft(검수 큐, 계속 안 보임)
 *   keep      지금 보이는 소개가 있고 둘 다 못 넘음 → 쓰지 않는다. 화면은 내보낼 때 정돈만 거친다(intro.ts). 사람이 본다
 *   same      바뀌는 게 없음
 * 건드리지 않는 칸: 사람이 확인한 칸(reviewed, artist_confirmed), 다시 볼 칸(stale), 원문이 없는 칸.
 * 원문(original)과 출처(sources)는 그대로 둔다. 쓰기는 조건부(읽은 상태와 updated_at이 그대로일 때만)라
 * 드라이런 뒤에 사람이나 워커가 고친 칸은 건너뛴다.
 *
 * `.env`는 이 체크아웃, 없으면 본 체크아웃에서 읽는다. 값은 출력하지 않는다. 백업과 계획은 data/intake/_backup/(gitignore).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { config as loadEnv } from "dotenv";
import type { ProfileField } from "@/lib/types";

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
const one = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const apply = argv.includes("--apply");
const restorePath = one("--restore");
const planPath = one("--plan");
const slug = one("--slug");
const limit = one("--limit") ? Number(one("--limit")) : Infinity;
const concurrency = Math.max(1, Number(one("--concurrency") ?? 4));
const actor = one("--actor") ?? "ted:brand-intro-retidy";
const outDir = resolve(one("--out-dir") ?? "data/intake/_backup");

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 작업이 아니라 멈춰요");
  process.exit(1);
}
const { createServiceClient } = await import("@/lib/supabase/server");
const { BRAND_FIELDS, parseFieldValue, publicValue } = await import("@/lib/brands/profile");
const { checkToneConversion } = await import("@/lib/brands/tone-gate");
const { tidyIntroText } = await import("@/lib/brands/intro-tidy");
const { todayISO } = await import("@/lib/exhibition/current");
type Row = Record<string, unknown>;

const INTRO = BRAND_FIELDS.find((f) => f.key === "intro")!;
const repo = await getRepository();
const db = createServiceClient();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(outDir, { recursive: true });

interface Gate {
  ok: boolean;
  issues: string[];
}
interface Entry {
  id: string;
  exhibitorId: string;
  name: string;
  /** 0 새해 준비상점, 1 다가오거나 열리는 박람회, 2 나머지. */
  priority: number;
  slugs: string[];
  original: string;
  sources: string[];
  before: { status: string; updatedAt: string; display: string | null; gateOk: boolean | null; public: boolean };
  decision: "write" | "tidy" | "draft" | "keep" | "same" | "error";
  after: { status: "collected" | "ai_draft"; display: string; gate: Gate } | null;
  /** 모델이 새로 쓴 소개(게이트를 못 넘으면 한 번 더 써서 나은 쪽). */
  fresh: { display: string; gate: Gate; tries: number } | null;
  error?: string;
}
interface Plan {
  version: "brand-intro-retidy.v1";
  createdAt: string;
  scope: string;
  backup: string;
  skipped: Record<string, number>;
  entries: Entry[];
}

/** PostgREST는 실패해도 예외를 안 던진다. 읽기 실패를 "0건"으로 보지 않게 여기서 던진다. */
async function readAll(table: string, cols: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).order("id").range(from, from + 999);
    if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
    if (!data) throw new Error(`${table} 읽기 실패: 결과가 없어요`);
    out.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

function introValue(f: ProfileField): { original?: string; display?: string; gate?: Gate } {
  return (f.value ?? {}) as { original?: string; display?: string; gate?: Gate };
}

function markdown(plan: Plan): string {
  const lines = [`# 브랜드 소개 다시 만들기 계획 (${plan.scope}, ${plan.createdAt})`, ""];
  const by = countBy(plan.entries.map((e) => e.decision));
  lines.push(`결정: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}`, `건드리지 않은 칸: ${JSON.stringify(plan.skipped)}`, "");
  for (const e of plan.entries) {
    lines.push(`## ${e.name} (${e.decision}, ${e.before.status} → ${e.after?.status ?? e.before.status}) ${e.slugs.join(" ")}`, "");
    lines.push("원문:", "```", e.original, "```", "지금:", "```", e.before.display ?? "(없음)", "```");
    if (e.after) lines.push("바뀔 소개:", "```", e.after.display, "```");
    if (e.fresh && !e.fresh.gate.ok) lines.push(`새 소개 게이트: ${e.fresh.gate.issues.join(" / ")}`, "", "```", e.fresh.display, "```");
    if (e.error) lines.push(`오류: ${e.error}`);
    lines.push("");
  }
  return lines.join("\n");
}

function countBy(xs: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const x of xs) m[x] = (m[x] ?? 0) + 1;
  return m;
}

/** 터미널 입력 또는 파이프 한 줄을 받는다(`echo <값> | npm run ...`). Claude Code의 `!`에서는 키보드 입력이 안 되니 파이프로. */
function ask(prompt: string): Promise<string> {
  return new Promise<string>((done) => {
    if (process.stdin.isTTY) process.stdout.write(prompt);
    const rl = createInterface({ input: process.stdin, terminal: false });
    let got = false;
    rl.once("line", (line) => {
      got = true;
      rl.close();
      done(line.trim());
    });
    rl.once("close", () => {
      if (!got) done("");
    });
  });
}

// ── 되돌리기 ────────────────────────────────────────────────────────────────
if (restorePath) {
  const rows = JSON.parse(readFileSync(restorePath, "utf8")) as ProfileField[];
  const intros = rows.filter((f) => f.field === "intro" && f.exhibitorId);
  console.log(`되돌릴 소개 칸 ${intros.length} (${restorePath})`);
  if ((await ask("운영에 씁니다. 되돌리려면 restore 를 입력하세요: ")) !== "restore") {
    console.error("✗ 입력이 restore와 달라서 멈춰요");
    process.exit(1);
  }
  let n = 0;
  for (const f of intros) {
    const r = await repo.upsertProfileField({ subject: { exhibitorId: f.exhibitorId! }, field: "intro", value: f.value, sources: f.sources, status: f.status, actor });
    if (r) n++;
  }
  console.log(`되돌렸어요 ${n}/${intros.length}`);
  process.exit(0);
}

// ── 적용 ────────────────────────────────────────────────────────────────────
if (apply) {
  if (!planPath) {
    console.error("사용법: npm run brand-intro:retidy -- --apply --plan <계획 파일>");
    process.exit(1);
  }
  const plan = JSON.parse(readFileSync(planPath, "utf8")) as Plan;
  if (plan.version !== "brand-intro-retidy.v1") throw new Error("계획 파일 형식이 달라요");
  const writes = plan.entries.filter((e) => e.after && (e.decision === "write" || e.decision === "tidy" || e.decision === "draft"));
  console.log(`계획 ${planPath}`);
  console.log(`범위 ${plan.scope}, 쓸 칸 ${writes.length}(${JSON.stringify(countBy(writes.map((e) => e.decision)))}), 안 쓰는 칸 ${plan.entries.length - writes.length}`);
  const answer = await ask(`운영에 씁니다. 계속하려면 ${plan.scope} 를 그대로 입력하세요: `);
  if (answer !== plan.scope) {
    console.error(`✗ 입력이 "${plan.scope}"와 달라서 멈춰요(받은 값: "${answer}")`);
    process.exit(1);
  }
  // 쓰기 직전 상태를 한 번 더 뜬다(드라이런 백업 뒤에 바뀐 칸까지).
  const now = await repo.listProfileFields({ exhibitorIds: [...new Set(writes.map((e) => e.exhibitorId))] });
  const backup = join(outDir, `brand-intro-retidy-apply-before-${stamp}.json`);
  writeFileSync(backup, JSON.stringify(now.filter((f) => f.field === "intro"), null, 2));
  console.log(`백업 ${backup}`);
  const result = { written: 0, changed: 0, invalid: 0, missing: 0 };
  for (const e of writes) {
    const value = { original: e.original, display: e.after!.display, gate: e.after!.gate };
    const checked = parseFieldValue({ exhibitorId: e.exhibitorId }, "intro", value);
    if (!checked.ok) {
      result.invalid++;
      console.log(`  ✗ ${e.name}: 값 검사 실패 ${checked.message}`);
      continue;
    }
    const r = await repo.upsertProfileFieldIfUnchanged(
      { subject: { exhibitorId: e.exhibitorId }, field: "intro", value: checked.value, sources: e.sources, status: e.after!.status, actor },
      { status: e.before.status as ProfileField["status"], updatedAt: e.before.updatedAt },
    );
    if (r.ok) result.written++;
    else if (r.reason === "changed") {
      result.changed++;
      console.log(`  - ${e.name}: 드라이런 뒤에 칸이 바뀌어서 건너뛰었어요`);
    } else result.missing++;
  }
  console.log(`끝: 썼어요 ${result.written}, 바뀌어서 건너뜀 ${result.changed}, 값 검사 실패 ${result.invalid}, 브랜드 없음 ${result.missing}`);
  // 다시 읽어 확인
  const after = await repo.listProfileFields({ exhibitorIds: [...new Set(writes.map((e) => e.exhibitorId))] });
  const byId = new Map(after.map((f) => [f.id, f]));
  const mismatch = writes.filter((e) => introValue(byId.get(e.id)!).display !== e.after!.display).length;
  console.log(`다시 읽기: 계획과 다른 칸 ${mismatch}(바뀌어서 건너뛴 칸 포함)`);
  console.log(`되돌리기: echo restore | npm run brand-intro:retidy -- --restore ${backup}`);
  process.exit(0);
}

// ── 드라이런 ────────────────────────────────────────────────────────────────
const { brandDraftDeps } = await import("@/lib/brands/draft-llm");
const { rewriteIntro } = await import("@/lib/brands/draft");
const convertTone = brandDraftDeps().convertTone;
if (!convertTone) {
  console.error("✗ Gemini 키가 없어 새 소개를 만들 수 없어요");
  process.exit(1);
}

const [exhibitions, participants, exhibitors, fields] = await Promise.all([
  readAll("exhibition", "id,slug,name,start_date,end_date"),
  readAll("exhibition_participant", "id,exhibitor_id,exhibition_id,display_name"),
  readAll("exhibitor", "id,canonical_name"),
  repo.listProfileFields(),
]);
const intros = fields.filter((f) => f.field === "intro" && f.exhibitorId);
const backup = join(outDir, `brand-intro-retidy-before-${stamp}.json`);
writeFileSync(backup, JSON.stringify(intros, null, 2));
console.log(`백업 ${backup} (소개 칸 ${intros.length})`);

const today = todayISO();
const NEWYEAR = "newyear-store-2026";
const exBy = new Map(exhibitions.map((e) => [String(e.id), e]));
const slugsOf = new Map<string, string[]>();
const namesOf = new Map<string, string[]>();
for (const p of participants) {
  const x = String(p.exhibitor_id);
  const e = exBy.get(String(p.exhibition_id));
  if (e) slugsOf.set(x, [...(slugsOf.get(x) ?? []), String(e.slug)]);
  if (p.display_name) namesOf.set(x, [...(namesOf.get(x) ?? []), String(p.display_name)]);
}
const exName = new Map(exhibitors.map((x) => [String(x.id), String(x.canonical_name)]));
const priorityOf = (x: string) => {
  const ss = slugsOf.get(x) ?? [];
  if (ss.includes(NEWYEAR)) return 0;
  const upcoming = ss.some((s) => {
    const e = exhibitions.find((y) => y.slug === s);
    return e && String(e.end_date ?? "") >= today;
  });
  return upcoming ? 1 : 2;
};
const firstStart = (x: string) =>
  (slugsOf.get(x) ?? [])
    .map((s) => String(exhibitions.find((y) => y.slug === s)?.start_date ?? "9999"))
    .filter((d) => d >= today)
    .sort()[0] ?? "9999";

const skipped: Record<string, number> = {};
const targets = intros
  .filter((f) => {
    const v = introValue(f);
    const why =
      f.status === "reviewed" || f.status === "artist_confirmed"
        ? `사람 확인(${f.status})`
        : f.status === "stale"
          ? "다시 볼 칸(stale)"
          : typeof v.original !== "string" || !v.original.trim()
            ? "원문 없음"
            : slug && !(slugsOf.get(f.exhibitorId!) ?? []).includes(slug)
              ? "범위 밖"
              : null;
    if (why) skipped[why] = (skipped[why] ?? 0) + 1;
    return !why;
  })
  .sort(
    (a, b) =>
      priorityOf(a.exhibitorId!) - priorityOf(b.exhibitorId!) ||
      firstStart(a.exhibitorId!).localeCompare(firstStart(b.exhibitorId!)) ||
      a.id.localeCompare(b.id),
  )
  .slice(0, limit);
console.log(`대상 ${targets.length}, 건드리지 않음 ${JSON.stringify(skipped)}`);

async function planOne(f: ProfileField): Promise<Entry> {
  const x = f.exhibitorId!;
  const v = introValue(f);
  const original = v.original!;
  const name = exName.get(x) ?? x;
  const protectedTerms = [name, ...(namesOf.get(x) ?? [])];
  const isPublic = typeof publicValue(INTRO, f) === "string";
  const base: Entry = {
    id: f.id,
    exhibitorId: x,
    name,
    priority: priorityOf(x),
    slugs: slugsOf.get(x) ?? [],
    original,
    sources: f.sources,
    before: { status: f.status, updatedAt: f.updatedAt, display: v.display ?? null, gateOk: v.gate?.ok ?? null, public: isPublic },
    decision: "same",
    after: null,
    fresh: null,
  };
  try {
    const fairNames = (slugsOf.get(x) ?? []).map((s) => String(exhibitions.find((y) => y.slug === s)?.name ?? "")).filter(Boolean);
    const { display, gate, tries } = await rewriteIntro(convertTone!, { original, protectedTerms, brandName: name, fairNames });
    base.fresh = { display, gate, tries };
    if (gate.ok) base.after = { status: "collected", display, gate };
    else {
      const tidied = v.display ? tidyIntroText(v.display) : "";
      const tGate = tidied ? checkToneConversion({ mode: "intro", original, display: tidied, protectedTerms, fairNames }) : null;
      if (isPublic && tGate?.ok) base.after = { status: "collected", display: tidied, gate: tGate };
      else if (!isPublic) base.after = { status: "ai_draft", display, gate };
      else base.decision = "keep";
    }
    if (base.after) {
      const same = base.after.display === v.display && base.after.status === f.status && !!v.gate?.ok === base.after.gate.ok;
      base.decision = same ? "same" : base.after.display === base.fresh.display ? (base.after.status === "collected" ? "write" : "draft") : "tidy";
      if (same) base.after = null;
    }
  } catch (e) {
    base.decision = "error";
    base.error = e instanceof Error ? e.message : String(e);
  }
  return base;
}

const entries: Entry[] = new Array(targets.length);
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (next < targets.length) {
      const i = next++;
      entries[i] = await planOne(targets[i]);
      done++;
      if (done % 20 === 0 || done === targets.length) console.log(`  ${done}/${targets.length}`);
    }
  }),
);

const plan: Plan = { version: "brand-intro-retidy.v1", createdAt: new Date().toISOString(), scope: slug ?? "all", backup, skipped, entries };
const planFile = join(outDir, `brand-intro-retidy-plan-${stamp}.json`);
writeFileSync(planFile, JSON.stringify(plan, null, 2));
writeFileSync(planFile.replace(/\.json$/, ".md"), markdown(plan));
const by = countBy(entries.map((e) => e.decision));
const visibleNow = entries.filter((e) => e.before.public).length;
const visibleAfter = entries.filter((e) => (e.after ? e.after.status === "collected" : e.before.public)).length;
console.log(`결정 ${JSON.stringify(by)}`);
console.log(`앱에 보이는 소개: 지금 ${visibleNow} → 적용 뒤 ${visibleAfter}`);
console.log(`계획 ${planFile}`);
console.log(`읽기 좋은 전후 ${planFile.replace(/\.json$/, ".md")}`);
console.log(`적용: echo ${plan.scope} | npm run brand-intro:retidy -- --apply --plan ${planFile}`);
