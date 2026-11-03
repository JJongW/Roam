import {
  fail,
  getAdminActor,
  notFound,
  ok,
  parseBody,
  requireAdmin,
  withErrorBoundary,
} from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { profileFieldPatchSchema } from "@/lib/schemas";
import { adminStatusError, fieldDef, parseFieldValue } from "@/lib/brands/profile";
import { checkToneConversion } from "@/lib/brands/tone-gate";
import { diffFields } from "@/lib/audit/diff";
import { AUDIT_SPECS } from "@/lib/audit/entities";

/**
 * 프로필 칸 하나 저장(0061). 관리자가 고치면 reviewed가 기본이다(기준 문서 5장).
 * `value: null`이면 칸을 비운다 — 출처 없는 칸은 비워 두는 게 지어낸 칸보다 낫다.
 *
 * 설명 문장(prose) 칸은 사람이 고친 문장도 같은 말투 게이트를 돌려 결과를 같이 저장한다.
 * 사람이 저장하면 reviewed라 앱에 보이지만, 게이트가 걸린 곳은 화면에 경고로 남는다.
 *
 * AI 초안 칸을 사람이 저장하면 전과 후를 change_log에 남긴다(검수 학습, lib/brands/lessons.ts).
 */
export async function PATCH(req: Request) {
  return withErrorBoundary(req, async () => {
    const denied = await requireAdmin();
    if (denied) return denied;
    const parsed = await parseBody(req, profileFieldPatchSchema);
    if (!parsed.ok) return parsed.res;
    const { subject, field } = parsed.data;
    const def = fieldDef(subject, field);
    if (!def) return fail("VALIDATION", "없는 칸이에요", { field: ["없는 칸이에요"] });
    const repo = await getRepository();
    const actor = await getAdminActor();
    const prev = (
      await repo.listProfileFields("exhibitorId" in subject ? { exhibitorIds: [subject.exhibitorId] } : { participantIds: [subject.participantId] })
    ).find((f) => f.field === field);

    const value = parsed.data.value;
    if (value === null || value === undefined) {
      await repo.deleteProfileField(subject, field);
      return ok({ field: null });
    }
    const checked = parseFieldValue(subject, field, value);
    if (!checked.ok) return fail("VALIDATION", checked.message, { value: [checked.message] });
    let finalValue = checked.value;
    if (def.kind === "prose") {
      const v = finalValue as { original: string; display?: string };
      finalValue = v.display ? { ...v, gate: checkToneConversion({ original: v.original, display: v.display }) } : { original: v.original };
    }
    const sources = parsed.data.sources ?? [];
    const status = parsed.data.status ?? "reviewed";
    const why = adminStatusError(subject, field, status, sources);
    if (why) return fail("VALIDATION", why, { status: [why] });

    const saved = await repo.upsertProfileField({ subject, field, value: finalValue, sources, status, actor });
    if (!saved) return notFound("브랜드나 출전을 찾을 수 없어요");

    if (prev?.status === "ai_draft") {
      await repo.recordChange({
        entity: "brand_profile_field",
        entityId: saved.id,
        scopeId: saved.exhibitorId ?? saved.participantId,
        source: "admin",
        actor,
        fieldDiffs: diffFields(
          { value: prev.value, status: prev.status, sources: prev.sources },
          { value: saved.value, status: saved.status, sources: saved.sources },
          AUDIT_SPECS.brand_profile_field.fields,
        ),
        reason: "AI 초안 검수",
      });
    }
    return ok({ field: saved });
  });
}
