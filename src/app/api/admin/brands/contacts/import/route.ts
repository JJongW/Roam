import { z } from "zod";
import { getAdminActor, notFound, ok, parseBody, requireAdmin, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { loadContactBoard } from "@/lib/brands/board-load";
import { importSources, importSummary, parseCsv, planHandleImport, readImportLines } from "@/lib/brands/handle-import";
import { instagramProfileUrl } from "@/lib/brands/outreach";
import { parseFieldValue } from "@/lib/brands/profile";
import { diffFields } from "@/lib/audit/diff";
import { AUDIT_SPECS } from "@/lib/audit/entities";
import { todayISO } from "@/lib/exhibition/current";

const bodySchema = z
  .object({
    exhibitionId: z.string().min(1).max(200),
    fileName: z.string().trim().min(1).max(200),
    csv: z.string().min(1).max(2_000_000),
    /** false(기본) = 미리보기만. true여야 쓴다. */
    apply: z.boolean().optional(),
  })
  .strict();

/**
 * 인스타 계정 csv를 이 박람회 브랜드 프로필 links 칸에 넣는다. 미리보기가 기본이고,
 * 사람이 미리보기를 보고 apply: true로 다시 보내야 쓴다. 빈 칸만 채운다(다른 계정이 있으면 충돌로 둔다).
 * 신뢰도는 출처 목록에 `handle-confidence:<값>`으로 남긴다(스키마에 칸이 없어서).
 * "후보"는 "다시 볼 것"(stale)으로 넣어 보내기 전에 프로필을 보게 한다.
 */
export async function POST(req: Request) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { exhibitionId, fileName, csv, apply } = parsed.data;
    const repo = await getRepository();
    const exhibition = (await repo.listExhibitions({ limit: 500 })).data.find((e) => e.id === exhibitionId);
    if (!exhibition) return notFound("박람회를 찾을 수 없어요");
    const { targets } = await loadContactBoard(repo, exhibition, todayISO());
    const plan = planHandleImport(readImportLines(parseCsv(csv)), targets);
    if (!apply) return ok({ plan, summary: importSummary(plan), applied: 0, failures: [] });

    const actor = await getAdminActor();
    const failures: { line: number; message: string }[] = [];
    let applied = 0;
    const existing = await repo.listProfileFields({
      exhibitorIds: [...new Set(plan.flatMap((p) => (p.decision === "fill" && p.exhibitorId ? [p.exhibitorId] : [])))],
    });
    for (const p of plan) {
      if (p.decision !== "fill" || !p.exhibitorId || !p.handle) continue;
      try {
        const prev = existing.find((f) => f.exhibitorId === p.exhibitorId && f.field === "links");
        const prevLinks = Array.isArray(prev?.value) ? (prev!.value as { kind: string; url: string }[]) : [];
        // 다른 종류 링크(사이트, X)는 그대로 두고 인스타만 더한다.
        const value = [...prevLinks.filter((l) => l.kind !== "instagram"), { kind: "instagram", url: instagramProfileUrl(p.handle) }];
        const checked = parseFieldValue({ exhibitorId: p.exhibitorId }, "links", value);
        if (!checked.ok) throw new Error(checked.message);
        const sources = [...new Set([...(prev?.sources ?? []), ...importSources(p, fileName)])];
        const saved = await repo.upsertProfileField({
          subject: { exhibitorId: p.exhibitorId },
          field: "links",
          value: checked.value,
          sources,
          status: p.confidence === "candidate" ? "stale" : (prev?.status ?? "collected"),
          actor,
        });
        if (!saved) throw new Error("브랜드를 찾을 수 없어요");
        await repo.recordChange({
          entity: "brand_profile_field",
          entityId: saved.id,
          scopeId: p.exhibitorId,
          source: "admin",
          actor,
          reason: `인스타 csv 가져오기(${fileName})`,
          fieldDiffs: diffFields(
            prev ? { value: prev.value, status: prev.status, sources: prev.sources } : null,
            { value: saved.value, status: saved.status, sources: saved.sources },
            AUDIT_SPECS.brand_profile_field.fields,
          ),
        });
        applied++;
      } catch (e) {
        failures.push({ line: p.line, message: e instanceof Error ? e.message : String(e) });
      }
    }
    return ok({ plan, summary: importSummary(plan), applied, failures });
  });
}
