/**
 * 운영에 남은 반말 로미 한 줄(booth_enrichment.roam_interpretation)을 해요체로 옮긴다.
 * 브랜드 규칙 §5(2026-11-02, 모든 사용자 문구 해요체) 이전에 쓴 줄들이다.
 * 변환과 판정은 `src/lib/enrichment/haeyo-convert.ts`(LLM은 말투만, 통과는 tone-gate +
 * quality-gate가 정한다).
 *
 * 두 단계로 나눈다. **본 것만 쓴다**. 쓰기 단계는 LLM을 다시 부르지 않고 드라이런
 * 결과 파일을 그대로 반영한다. 다시 생성하면 검토한 문장과 쓰는 문장이 달라진다.
 *
 *   # 1) 드라이런(기본): DB는 읽기만, 결과를 파일로
 *   npx vite-node -c worker/vite.config.ts scripts/roam-line-haeyo.ts -- \
 *     --in data/intake/_backup/roam-interpretation-banmal-2026-11-03.json \
 *     --out <dryrun.json> [--sample 50] [--concurrency 4]
 *
 *   # 2) 쓰기: 드라이런 결과를 반영(--plan이면 계획만 세고 쓰지 않는다)
 *   npx vite-node -c worker/vite.config.ts scripts/roam-line-haeyo.ts -- --apply --from <dryrun.json>
 *
 *   # 3) 대조: 반영 기록과 운영 값을 맞대고, 남은 비해요체 로미 한 줄을 센다
 *   npx vite-node -c worker/vite.config.ts scripts/roam-line-haeyo.ts -- --verify --report <haeyo-apply-report.json>
 *
 * 쓰기 규칙(2026-11-03 Ted 승인안, `decideApply`):
 * - 실행 직전 운영 값을 `data/intake/_backup/`에 타임스탬프 파일로 뜬다.
 * - 통과, 또는 원문에 있던 상투어만 걸린 줄: `upsertBoothEnrichment`로 roamInterpretation만
 *   갱신한다. 저장소가 before를 직접 읽어 change_log를 남기고(source `haeyo-migration`),
 *   실패는 wrote()가 던진다. 상투어 줄은 후속 정리용 목록 파일로도 남긴다.
 * - 원문이 "못 찾았다"나 추측인 줄: after 없이 "재초안 필요"로 검수 큐(pending).
 * - 그 밖의 실패: after를 담아 검수 큐. payload는 roamInterpretation 하나뿐이라 승인해도
 *   다른 필드를 안 건드린다. 가운뎃점만 걸린 줄은 쉼표로 고쳐 다시 판정한다.
 * - 드라이런 뒤에 누가 그 줄을 고쳤으면(지금 값 ≠ before) 건너뛴다. 사람 글을 덮지 않는다.
 * - 원본 백업은 --in 파일이다(운영에서 읽기 전용으로 뜬 값). 되돌리기는 change_log나 그 파일로.
 */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { generateJSON } from "@/lib/ai/gemini";
import {
  convertLine,
  decideApply,
  evenSample,
  mapPool,
  type ApplyDecision,
  type LineResult,
} from "@/lib/enrichment/haeyo-convert";
import { endsInHaeyo } from "@/lib/enrichment/quality-gate";
import { isSomeoneElsesVoice } from "@/lib/booth/voice";

const SOURCE = "haeyo-migration";

interface InputRow {
  booth_id: string;
  roam_interpretation: string;
  booth: { code: string; exhibition_id: string };
}

interface DryRunRow {
  booth_id: string;
  exhibition_id: string;
  code: string;
  slug: string;
  booth_name: string;
  before: string;
  after: string;
  pass: boolean;
  reasons: string[];
  codes: string[];
  confidence: number;
  quality_issues: LineResult["qualityIssues"];
  calls: number;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const apply = process.argv.includes("--apply");
const planOnly = process.argv.includes("--plan");
const verify = process.argv.includes("--verify");

const repo = await getRepository();

if (verify) {
  await runVerify();
} else if (apply || planOnly) {
  await runApply();
} else {
  await runDryRun();
}

async function runDryRun() {
  const inPath = arg("in") ?? "data/intake/_backup/roam-interpretation-banmal-2026-11-03.json";
  const outPath = arg("out");
  if (!outPath) throw new Error("--out <dryrun.json>이 필요하다");
  const sample = arg("sample") ? Number(arg("sample")) : undefined;
  const concurrency = Number(arg("concurrency") ?? 4);

  const all = JSON.parse(await readFile(inPath, "utf8")) as InputRow[];
  const rows = sample ? evenSample(all, sample) : all;

  // 박람회 slug과 부스 이름(읽기만). 이름은 tone-gate의 지켜야 할 말, quality-gate의 name_only에 쓴다.
  const exIds = [...new Set(rows.map((r) => r.booth.exhibition_id))];
  const exhibitions = (await repo.listExhibitions({ limit: 1000 })).data;
  const slugById = new Map(exhibitions.map((e) => [e.id, e.slug]));
  const nameById = new Map<string, string>();
  for (const exId of exIds) {
    const booths = await repo.listBoothsByExhibitionId(exId);
    // 이 읽기는 실패해도 []를 준다. 0건이면 실패로 본다(대상 부스가 있는 박람회다).
    if (booths.length === 0) throw new Error(`부스를 못 읽었다: ${exId}`);
    for (const b of booths) nameById.set(b.id, b.name);
  }

  const llm = async (req: { system: string; prompt: string }) =>
    (
      await generateJSON({
        system: req.system,
        prompt: req.prompt,
        schema: z.object({ after: z.string() }),
        temperature: 0.2,
      })
    ).after;

  console.log(`대상 ${rows.length}건${sample ? ` (표본, 전체 ${all.length})` : ""} · 동시성 ${concurrency} · 드라이런`);
  let done = 0;
  const results = await mapPool(rows, concurrency, async (r) => {
    const res = await convertLine(
      { boothId: r.booth_id, before: r.roam_interpretation, boothName: nameById.get(r.booth_id) },
      llm,
    );
    done += 1;
    if (done % 50 === 0) console.log(`  …${done}/${rows.length}`);
    const row: DryRunRow = {
      booth_id: r.booth_id,
      exhibition_id: r.booth.exhibition_id,
      code: r.booth.code,
      slug: slugById.get(r.booth.exhibition_id) ?? r.booth.exhibition_id,
      booth_name: nameById.get(r.booth_id) ?? "",
      before: res.before,
      after: res.after,
      pass: res.pass,
      reasons: res.reasons,
      codes: res.codes,
      confidence: res.confidence,
      quality_issues: res.qualityIssues,
      calls: res.calls,
    };
    return row;
  });

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(results, null, 1));

  const pass = results.filter((r) => r.pass).length;
  const calls = results.reduce((s, r) => s + r.calls, 0);
  console.log(`통과 ${pass}/${results.length} (${((pass / results.length) * 100).toFixed(1)}%) · LLM 호출 ${calls}회`);
  const codeCount = new Map<string, number>();
  for (const r of results) for (const c of new Set(r.codes)) codeCount.set(c, (codeCount.get(c) ?? 0) + 1);
  console.log("실패 이유 상위:");
  for (const [c, n] of [...codeCount].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${n}  ${c}`);
  console.log("박람회별:");
  const bySlug = new Map<string, { n: number; pass: number }>();
  for (const r of results) {
    const s = bySlug.get(r.slug) ?? { n: 0, pass: 0 };
    s.n += 1;
    if (r.pass) s.pass += 1;
    bySlug.set(r.slug, s);
  }
  for (const [s, v] of bySlug) console.log(`  ${s}: ${v.pass}/${v.n}`);
  console.log(`결과: ${outPath}`);
}

async function runApply() {
  const from = arg("from");
  if (!from) throw new Error("--apply는 --from <dryrun.json>이 필요하다(검토한 결과만 쓴다)");
  const rows = JSON.parse(await readFile(from, "utf8")) as DryRunRow[];
  const plan = rows.map((r) => ({ row: r, d: decideApply({ ...r, boothName: r.booth_name }) }));
  const count = (a: string) => plan.filter((p) => p.d.action === a).length;
  console.log(
    `계획: 갱신 ${count("update")} · 상투어만 걸려 갱신 ${count("update_filler")} · 재초안 큐 ${count("redraft")} · 검수 큐 ${count("review")}${planOnly ? " (--plan: 쓰지 않음)" : ""}`,
  );

  // 드라이런 이후 바뀐 줄을 거르려고 지금 값을 다시 읽는다. 이 값이 실행 직전 백업이다.
  const current = await readCurrent(new Set(rows.map((r) => r.exhibition_id)));
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = arg("backup-dir") ?? "data/intake/_backup";
  const backupPath = path.join(backupDir, `roam-interpretation-before-haeyo-apply-${stamp}.json`);
  const outDir = arg("report-dir") ?? path.dirname(from);
  if (planOnly) return;

  await mkdir(backupDir, { recursive: true });
  await writeFile(
    backupPath,
    JSON.stringify(
      rows.map((r) => ({ booth_id: r.booth_id, exhibition_id: r.exhibition_id, code: r.code, roam_interpretation: current.get(r.booth_id) ?? null })),
      null,
      1,
    ),
  );
  console.log(`백업: ${backupPath}`);

  const day = stamp.slice(0, 10);
  const updatedIds: string[] = [];
  const stale: string[] = [];
  const queue: { row: DryRunRow; d: ApplyDecision }[] = [];
  const fillerRows: DryRunRow[] = [];
  const failures: { boothId: string; message: string }[] = [];

  for (const { row: r, d } of plan) {
    if (current.get(r.booth_id) !== r.before) {
      stale.push(r.booth_id);
      continue;
    }
    if (d.action === "redraft" || d.action === "review") {
      queue.push({ row: r, d });
      continue;
    }
    const why =
      d.action === "update_filler"
        ? "원문에 있던 상투어(다양한)만 걸림, 상투어는 후속 정리"
        : d.fixedMiddot
          ? "가운뎃점을 쉼표로 고쳐 다시 판정해 통과"
          : "tone-gate와 quality-gate 통과";
    try {
      await repo.upsertBoothEnrichment(
        r.booth_id,
        { roamInterpretation: d.after },
        { source: SOURCE, actor: null, reason: `로미 한 줄 해요체 변환(${day}, 말투만, ${why})` },
      );
      updatedIds.push(r.booth_id);
      if (d.action === "update_filler") fillerRows.push({ ...r, after: d.after });
      if (updatedIds.length % 100 === 0) console.log(`  …갱신 ${updatedIds.length}`);
    } catch (e) {
      failures.push({ boothId: r.booth_id, message: e instanceof Error ? e.message : String(e) });
    }
  }

  // 검수 큐. 재초안 대상은 after를 싣지 않는다(다시 써야 할 줄이라 승인해도 바뀌는 게 없게).
  // 지적은 quality-gate 원본 + tone/voice/content 이유(검수 화면이 issues를 그린다).
  let queued = 0;
  for (let i = 0; i < queue.length; i += 100) {
    const slice = queue.slice(i, i + 100);
    queued += await repo.createEnrichmentCandidates(
      slice.map(({ row: r, d }) => ({
        boothId: r.booth_id,
        exhibitionId: r.exhibition_id,
        source: SOURCE,
        payload: d.action === "redraft" ? {} : { roamInterpretation: d.after },
        sources: [],
        confidence: r.confidence,
        issues: [
          ...(d.action === "redraft"
            ? [{ code: "needs_redraft", field: "roamInterpretation", message: "재초안 필요: 원문이 정보를 못 찾았다는 말이나 추측이라 말투만 바꿔서는 안 돼요", weight: 1 }]
            : []),
          ...r.quality_issues,
          ...d.reasons
            .map((message, k) => ({ message, code: d.codes[k] ?? "haeyo" }))
            .filter((x) => !x.code.startsWith("quality:"))
            .map((x) => ({ code: x.code, field: "roamInterpretation", message: x.message, weight: 0.1 })),
        ],
      })),
    );
  }

  const fillerPath = path.join(outDir, `haeyo-filler-followup-${stamp}.json`);
  await writeFile(fillerPath, JSON.stringify(fillerRows.map((r) => ({ booth_id: r.booth_id, slug: r.slug, code: r.code, after: r.after })), null, 1));
  const reportPath = path.join(outDir, `haeyo-apply-report-${stamp}.json`);
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        updated: updatedIds,
        stale,
        queued: queue.map(({ row: r, d }) => ({ booth_id: r.booth_id, action: d.action })),
        failures,
        expected: Object.fromEntries(plan.map(({ row: r, d }) => [r.booth_id, d.action === "redraft" || d.action === "review" ? r.before : d.after])),
      },
      null,
      1,
    ),
  );
  console.log(
    `갱신 ${updatedIds.length}건(상투어 후속 ${fillerRows.length}) · 검수 큐 ${queued}건 · 드라이런 뒤 바뀌어 건너뜀 ${stale.length}건 · 쓰기 실패 ${failures.length}건`,
  );
  console.log(`상투어 후속 목록: ${fillerPath}\n반영 기록: ${reportPath}`);
  for (const f of failures.slice(0, 10)) console.log(`  ✗ ${f.boothId}: ${f.message}`);
}

async function readCurrent(exIds: Iterable<string>): Promise<Map<string, string | undefined>> {
  const current = new Map<string, string | undefined>();
  for (const exId of exIds) {
    const booths = await repo.listBoothsByExhibitionId(exId);
    if (booths.length === 0) throw new Error(`부스를 못 읽었다: ${exId}`);
    for (const b of booths) current.set(b.id, b.enrichment?.roamInterpretation);
  }
  return current;
}

/**
 * 반영 뒤 대조. 반영 기록의 기대값과 운영 값을 맞대고, 운영 전체에서 해요체가 아닌
 * 로미 한 줄이 몇 개 남았는지 센다(quality-gate의 endsInHaeyo와 남의 목소리 판정).
 */
async function runVerify() {
  const reportPath = arg("report");
  if (!reportPath) throw new Error("--verify는 --report <haeyo-apply-report.json>이 필요하다");
  const report = JSON.parse(await readFile(reportPath, "utf8")) as {
    updated: string[];
    stale: string[];
    queued: { booth_id: string; action: string }[];
    expected: Record<string, string>;
  };
  const exhibitions = (await repo.listExhibitions({ limit: 1000 })).data;
  const all = new Map<string, { slug: string; line?: string }>();
  for (const e of exhibitions) {
    for (const b of await repo.listBoothsByExhibitionId(e.id)) all.set(b.id, { slug: e.slug, line: b.enrichment?.roamInterpretation });
  }
  const updatedOk = report.updated.filter((id) => all.get(id)?.line === report.expected[id]).length;
  const queuedUntouched = report.queued.filter((q) => all.get(q.booth_id)?.line === report.expected[q.booth_id]).length;
  const pending = await repo.listEnrichmentCandidates({ boothIds: report.queued.map((q) => q.booth_id), status: "pending", limit: 1000 });
  const pendingMine = pending.filter((c) => c.source === SOURCE).length;

  const lines = [...all.values()].filter((v) => v.line?.trim());
  const notHaeyo = lines.filter((v) => !endsInHaeyo(v.line!.replace(/\s+/g, " ").trim()) || isSomeoneElsesVoice(v.line));
  const bySlug = new Map<string, number>();
  for (const v of notHaeyo) bySlug.set(v.slug, (bySlug.get(v.slug) ?? 0) + 1);
  console.log(`갱신 확인 ${updatedOk}/${report.updated.length} · 큐 대상 원문 유지 ${queuedUntouched}/${report.queued.length} · 큐 pending(${SOURCE}) ${pendingMine} · 건너뜀 ${report.stale.length}`);
  console.log(`운영 로미 한 줄 ${lines.length}개 중 해요체 아님 ${notHaeyo.length}개`);
  for (const [s, n] of bySlug) console.log(`  ${s}: ${n}`);
  for (const v of notHaeyo.slice(0, 15)) console.log(`  - ${v.slug}: ${v.line}`);
}
