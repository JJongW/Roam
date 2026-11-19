/**
 * 코믹월드 문구전 공식 참가 명단 → brands.v1 파일 + 부스 번호와 요일 옆 파일.
 *
 *   npm run brands:comicw -- <회차 id> --slug <행사 slug> --out <brands.json> --booths <booths.json>
 *     [--instagram-csv <permissions.csv>] [--photos <brand-photos.v1.json>] [--save-html <폴더>]
 *
 *   회차 id: 문구전 2026 겨울 = 36(2026-11-19 확정 부스번호 목록 242곳)
 *
 * 공개 페이지 두 장만 읽는다(로그인 없음, 1초 간격): 행사장 배치도의 확정 부스번호 목록, 부스컷 목록.
 * 변환은 src/lib/intake/comicw-official.ts(순수, 테스트 있음).
 * - 인스타: `--instagram-csv`(Roam-design 문구전 permissions.csv)에서 instagramStatus=confirmed인 것만. 인스타를 긁지 않는다.
 * - 운영 브랜드 id: `--photos`(허락 사진 manifest)의 팀 exhibitorId를 이름으로 잇는다(사람이 확인한 연결).
 *
 * **파일만 만든다.** 운영 DB에 쓰지 않는다. 대조는 `npm run intake:dry-run -- <brands.json> --brands-only-if-missing`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { buildComicwBrandsFile, parseBoothMapList, parseBoothcutList } from "@/lib/intake/comicw-official";
import { flatName } from "@/lib/exhibitor/identity";

const UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36";
const argv = process.argv.slice(2).filter((a) => a !== "--");
const fare = Number(argv[0]);
const opt = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const slug = opt("--slug");
const out = opt("--out");
const boothsOut = opt("--booths");
if (!Number.isInteger(fare) || fare <= 0 || !slug || !out || !boothsOut) {
  console.error("사용법: npm run brands:comicw -- <회차 id> --slug <행사 slug> --out <brands.json> --booths <booths.json> [--instagram-csv <csv>] [--photos <manifest>] [--save-html <폴더>]");
  process.exit(1);
}

let last = 0;
async function get(url: string): Promise<string> {
  const wait = last + 1000 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
  const res = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

const mapUrl = `https://comicw.net/moongu/booth_map.php?fare_id=${fare}`;
const cutUrl = `https://comicw.net/g/boothcut/?fare=${fare}`;
const [mapHtml, cutHtml] = [await get(mapUrl), await get(cutUrl)];
const saveDir = opt("--save-html");
if (saveDir) {
  mkdirSync(saveDir, { recursive: true });
  writeFileSync(join(saveDir, `booth_map-${fare}.html`), mapHtml);
  writeFileSync(join(saveDir, `boothcut-${fare}.html`), cutHtml);
}
const list = parseBoothMapList(mapHtml);
const cuts = parseBoothcutList(cutHtml);
if (!list.entries.length) {
  console.error("✗ 확정 부스번호 목록이 비어 있어요. 파일을 만들지 않았어요");
  process.exit(1);
}

// 인스타: permissions.csv의 확인된 것만. 따옴표 안 쉼표가 있어 간단한 csv 해석기로 읽는다.
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}
const instagram = new Map<string, string>();
const csvPath = opt("--instagram-csv");
if (csvPath)
  for (const r of parseCsv(readFileSync(csvPath, "utf8")))
    if (r.instagramStatus === "confirmed" && /^@[A-Za-z0-9._]+$/.test(r.instagram.trim()))
      instagram.set(flatName(r.team), `https://www.instagram.com/${r.instagram.trim().slice(1)}/`);

const exhibitorIds = new Map<string, string>();
const photosPath = opt("--photos");
if (photosPath)
  for (const t of (JSON.parse(readFileSync(photosPath, "utf8")) as { teams: { name: string; exhibitorId?: string }[] }).teams)
    if (t.exhibitorId) exhibitorIds.set(flatName(t.name), t.exhibitorId);

const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const { file, booths, duplicates } = buildComicwBrandsFile({
  entries: list.entries,
  boothcuts: cuts,
  exhibitionSlug: slug,
  sourceUrl: mapUrl,
  collectedAt: today,
  instagram,
  exhibitorIds,
  keyPrefix: slug,
  note: `코믹월드 공식 행사장 배치도의 확정 부스번호 목록(${list.declaredCount ?? list.entries.length}개 부스)과 부스컷 목록(요일). 인스타는 Roam-design permissions.csv의 확인된 값만. 부스 번호와 요일은 옆 파일 ${boothsOut}`,
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
writeFileSync(
  boothsOut,
  `${JSON.stringify({ exhibitionSlug: slug, source: [mapUrl, cutUrl], collectedAt: today, mapReady: list.mapReady, note: "배치도가 나오면 intake.v1을 만들 때 쓴다. days는 부스컷이 있는 팀만(나머지는 모름)", booths }, null, 2)}\n`,
);
console.log(
  `✓ brands.v1 ${file.brands.length}곳 → ${out} (공식 목록 ${list.declaredCount ?? "?"}, 부스컷 ${new Set(cuts.map((c) => c.id)).size}팀, ` +
    `인스타 ${file.brands.filter((b) => b.instagramUrl).length}, 운영 브랜드 지정 ${file.brands.filter((b) => b.exhibitorId).length}, 목록 안 같은 이름 ${duplicates.length})`,
);
console.log(`  부스와 요일 → ${boothsOut} (배치도 그림 ${list.mapReady ? "있음" : "아직 없음"})`);
console.log("  운영 DB에는 쓰지 않았어요");
