import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Repository } from "@/lib/repositories/types";
import type { Exhibition, ExhibitorGraph } from "@/lib/types";
import { FLOORPLANS } from "@/lib/floorplans";
import { brandsFileSchema } from "@/lib/intake/brands-schema";
import { intakeFileSchema } from "@/lib/intake/schema";
import { planIntake } from "@/lib/intake/plan";
import { auditFair } from "@/lib/intake/fair-audit";

/**
 * 인입 "올릴 파일" — /admin/intake와 관리자 홈이 같은 함수를 부른다(2026-11-19 Ted: 숫자가 안 맞음).
 *
 * 대기의 뜻: **끝나지 않은 박람회**(끝나는 날이 오늘이거나 뒤)의 레포 파일 중, 올리면 무언가 더하거나
 * 바뀌는 것. 끝난 박람회 파일은 일부러 안 올린 것도 있어서 뺀다.
 *
 * 판정은 운영 미리보기(scripts/intake-dry-run.ts)와 같은 계산을 읽기만으로 한다.
 * - 행사 행 파일: 운영에 그 slug가 없으면 대기
 * - intake.v1: 행사가 없으면 대기(행사 먼저). 있으면 planIntake로 새 부스나 채울 칸이 있으면 대기
 * - brands.v1: 행사가 없으면 대기. 있으면 파일 브랜드 중 그 박람회에 이어지지 않은 곳이 있으면 대기.
 *   전체 미리보기(planBrandsFromRepository)는 모든 박람회 부스를 읽어 무거워서, 같은 열쇠(파일 키,
 *   인스타, 도메인)로 브랜드를 찾는 점검(auditFair)을 쓴다. 채울 프로필 칸은 여기서 세지 않는다.
 */

export interface RepoFile {
  kind: "exhibition" | "brands" | "booths";
  /** data/ 아래 경로. 화면과 보고에 그대로 쓴다. */
  path: string;
  slug: string;
  /** data/exhibitions 파일에만 있다. */
  name?: string;
  startDate?: string;
  endDate?: string;
  /** brands.v1 브랜드 수, intake.v1 부스 수. */
  size?: number;
  raw: Record<string, unknown>;
}

/**
 * 레포 data/ 아래 인입 파일 목록. 못 읽으면 null(배포 번들에 data/가 빠졌을 때). 0건으로 위장하지 않는다.
 * 밑줄로 시작하는 파일(_backup, _review)과 링크 보충 파일(-links)은 인입 계약 파일이 아니라 뺀다.
 * 행사가 정해지지 않은 브랜드 파일(exhibitionSlug: null)은 기다리는 박람회가 없어 뺀다.
 */
export function readRepoFiles(root = process.cwd()): RepoFile[] | null {
  const read = (dir: string) => {
    const abs = join(root, "data", dir);
    if (!existsSync(abs)) return [];
    return readdirSync(abs)
      .filter((f) => f.endsWith(".json") && !f.startsWith("_") && !f.endsWith("-links.json"))
      .map((f) => ({ path: `data/${dir}/${f}`, json: JSON.parse(readFileSync(join(abs, f), "utf8")) as Record<string, unknown> }));
  };
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  try {
    if (!existsSync(join(root, "data"))) return null;
    const out: RepoFile[] = [];
    for (const { path, json } of read("exhibitions")) {
      if (typeof json.slug !== "string") continue;
      out.push({ kind: "exhibition", path, slug: json.slug, name: str(json.name), startDate: str(json.startDate), endDate: str(json.endDate), raw: json });
    }
    for (const { path, json } of read("brands")) {
      if (typeof json.exhibitionSlug !== "string") continue;
      out.push({ kind: "brands", path, slug: json.exhibitionSlug, size: Array.isArray(json.brands) ? json.brands.length : undefined, raw: json });
    }
    for (const { path, json } of read("intake")) {
      if (typeof json.exhibitionSlug !== "string") continue;
      out.push({ kind: "booths", path, slug: json.exhibitionSlug, size: Array.isArray(json.booths) ? json.booths.length : undefined, raw: json });
    }
    return out;
  } catch {
    return null;
  }
}

export const FILE_KIND_LABEL: Record<RepoFile["kind"], string> = { exhibition: "행사 행", brands: "브랜드", booths: "부스" };

export interface IntakeQueueItem {
  path: string;
  kind: RepoFile["kind"];
  slug: string;
  fairName: string;
  startDate: string | null;
  /** 올리면 무엇이 바뀌나. 화면에 그대로 뜬다. */
  change: string;
}

/**
 * 끝나지 않은 박람회의 레포 파일 중 올리면 바뀌는 것. 화면과 홈이 같이 부른다.
 * `files`가 null(레포를 못 읽음)이면 null을 돌려준다.
 */
export async function intakeQueue(
  repo: Repository,
  input: { today: string; exhibitions?: Exhibition[]; graph?: ExhibitorGraph; files?: RepoFile[] | null },
): Promise<IntakeQueueItem[] | null> {
  const files = input.files === undefined ? readRepoFiles() : input.files;
  if (!files) return null;
  const exhibitions = input.exhibitions ?? (await repo.listExhibitions({ limit: 500 })).data;
  const bySlug = new Map(exhibitions.map((e) => [e.slug, e]));
  const fileFair = new Map(files.filter((f) => f.kind === "exhibition").map((f) => [f.slug, f]));

  // 박람회가 끝났는지: 운영 행이 있으면 그 날짜, 없으면 레포 행사 행 파일의 날짜. 둘 다 모르면 끝난 것으로 보지 않는다.
  const endOf = (slug: string) => bySlug.get(slug)?.endDate ?? fileFair.get(slug)?.endDate ?? null;
  const live = files.filter((f) => {
    const end = endOf(f.slug);
    return end === null || end >= input.today;
  });
  if (live.length === 0) return [];

  const needGraph = live.some((f) => f.kind === "brands" && bySlug.has(f.slug));
  const graph = input.graph ?? (needGraph ? await repo.loadExhibitorGraph() : undefined);

  const items = await Promise.all(
    live.map(async (f): Promise<IntakeQueueItem | null> => {
      const fair = bySlug.get(f.slug);
      const base = {
        path: f.path,
        kind: f.kind,
        slug: f.slug,
        fairName: fair?.name ?? fileFair.get(f.slug)?.name ?? f.slug,
        startDate: fair?.startDate ?? fileFair.get(f.slug)?.startDate ?? null,
      };
      if (f.kind === "exhibition") return fair ? null : { ...base, change: "운영에 행사 행이 없어요" };
      if (!fair) return { ...base, change: "행사 행을 먼저 만들어야 해요" };

      if (f.kind === "booths") {
        const parsed = intakeFileSchema.safeParse(f.raw);
        if (!parsed.success) return { ...base, change: "파일 형식이 안 맞아요" };
        const [booths, halls, categories] = await Promise.all([
          repo.listBoothsFull(fair.id),
          repo.listHalls(fair.id),
          repo.listCategories(fair.id),
        ]);
        const plan = planIntake({ file: parsed.data, booths, halls, categories, floorplanBooths: FLOORPLANS[f.slug]?.booths ?? [] });
        const n = plan.creates.length + plan.fills.length;
        return n > 0 ? { ...base, change: `새 부스 ${plan.creates.length}, 채울 부스 ${plan.fills.length}` } : null;
      }

      const parsed = brandsFileSchema.safeParse(f.raw);
      if (!parsed.success) return { ...base, change: "파일 형식이 안 맞아요" };
      const audit = auditFair({
        exhibitions: [fair],
        match: [fair.slug],
        graph: graph!,
        fields: [],
        boothCounts: {},
        floorplanSlugs: [],
        brands: parsed.data,
      });
      const unlinked = audit.brands.filter((b) => b.linkedFairs.length === 0).length;
      return unlinked > 0 ? { ...base, change: `이 박람회에 안 이어진 브랜드 ${unlinked}` } : null;
    }),
  );
  // 시작이 가까운 박람회 먼저(날짜 모름은 맨 뒤), 같은 박람회 안에서는 올리는 순서(행사 행, 브랜드, 부스).
  const step = { exhibition: 0, brands: 1, booths: 2 } as const;
  return items
    .filter((x): x is IntakeQueueItem => x !== null)
    .sort(
      (a, b) =>
        (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") ||
        a.slug.localeCompare(b.slug) ||
        step[a.kind] - step[b.kind],
    );
}
