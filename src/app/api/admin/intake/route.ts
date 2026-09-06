import { getRepository } from "@/lib/repositories";
import { notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { FLOORPLANS } from "@/lib/floorplans";
import { intakeRequestSchema } from "@/lib/intake/schema";
import { planIntake } from "@/lib/intake/plan";
import type { IntakePlan } from "@/lib/intake/plan";

/**
 * 전시 인입 — 정규형 파일 하나로 부스와 저작 정보를 넣는다.
 *
 * apply=false(기본)면 계획만 돌려준다. 미리보기가 이걸 그린다. 좌표는 파일이
 * 아니라 FLOORPLANS에서 code로 가져온다(docs/.../2026-09-06-exhibition-intake-design.md).
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;

  const parsed = await parseBody(req, intakeRequestSchema);
  if (!parsed.ok) return parsed.res;
  const { file, apply, overwrite } = parsed.data;

  const repo = await getRepository();
  const exhibitionId = await repo.getExhibitionIdBySlug(file.exhibitionSlug);
  if (!exhibitionId) {
    return notFound(`전시를 찾을 수 없습니다: ${file.exhibitionSlug}`);
  }

  const [booths, halls, categories] = await Promise.all([
    repo.listBoothsByExhibitionId(exhibitionId),
    repo.listHalls(exhibitionId),
    repo.listCategories(exhibitionId),
  ]);

  const plan = planIntake({
    file,
    booths,
    halls,
    categories,
    floorplanBooths: FLOORPLANS[file.exhibitionSlug]?.booths ?? [],
    overwrite,
  });

  if (!apply) return ok({ plan, applied: null });
  return ok({ plan, applied: await applyPlan(repo, exhibitionId, plan) });
}

interface ApplyResult {
  createdBooths: number;
  filledBooths: number;
  createdHalls: number;
  createdCategories: number;
  failures: { code: string; message: string }[];
}

/**
 * 부스 단위로 진행하고 실패한 것만 모아서 돌려준다. 900부스 중 3개 때문에 전부
 * 막히면 도구로서 쓸모가 없다. 홀·카테고리는 부스보다 먼저 — 부스가 그 id를
 * 참조하므로 여기서 실패하면 그 이름을 쓰는 부스는 다 같이 실패한다.
 */
async function applyPlan(
  repo: Awaited<ReturnType<typeof getRepository>>,
  exhibitionId: string,
  plan: IntakePlan,
): Promise<ApplyResult> {
  const result: ApplyResult = {
    createdBooths: 0,
    filledBooths: 0,
    createdHalls: 0,
    createdCategories: 0,
    failures: [],
  };

  const [halls, categories] = await Promise.all([
    repo.listHalls(exhibitionId),
    repo.listCategories(exhibitionId),
  ]);
  const hallIdByName = new Map(halls.map((h) => [h.name, h.id]));
  const categoryIdByName = new Map(categories.map((c) => [c.name, c.id]));

  for (const name of plan.newHalls) {
    try {
      const hall = await repo.createHall(exhibitionId, name);
      hallIdByName.set(name, hall.id);
      result.createdHalls += 1;
    } catch (e) {
      result.failures.push({ code: `hall:${name}`, message: msg(e) });
    }
  }
  for (const { slug, name } of plan.newCategories) {
    try {
      const category = await repo.createCategory({ slug, name });
      categoryIdByName.set(name, category.id);
      result.createdCategories += 1;
    } catch (e) {
      result.failures.push({ code: `category:${name}`, message: msg(e) });
    }
  }

  for (const c of plan.creates) {
    const hallId = hallIdByName.get(c.hallName);
    const categoryId = categoryIdByName.get(c.categoryName);
    if (!hallId || !categoryId) {
      result.failures.push({
        code: c.code,
        message: `홀·카테고리가 준비되지 않았습니다 (${c.hallName} / ${c.categoryName})`,
      });
      continue;
    }
    try {
      const booth = await repo.createBooth({
        exhibitionId,
        hallId,
        categoryId,
        code: c.code,
        kind: c.kind,
        name: c.name,
        company: c.company,
        description: c.description,
        longDescription: c.longDescription,
        images: c.images,
        logoUrl: c.logoUrl,
        instagramUrl: c.instagramUrl,
        websiteUrl: c.websiteUrl,
        tags: c.tags,
        x: c.x,
        y: c.y,
        popularity: 50,
      });
      if (c.enrichment) await repo.upsertBoothEnrichment(booth.id, c.enrichment);
      result.createdBooths += 1;
    } catch (e) {
      result.failures.push({ code: c.code, message: msg(e) });
    }
  }

  for (const f of plan.fills) {
    try {
      if (Object.keys(f.boothPatch).length > 0) {
        await repo.updateBooth(f.boothId, f.boothPatch);
      }
      if (f.enrichment) await repo.upsertBoothEnrichment(f.boothId, f.enrichment);
      result.filledBooths += 1;
    } catch (e) {
      result.failures.push({ code: f.code, message: msg(e) });
    }
  }

  return result;
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
