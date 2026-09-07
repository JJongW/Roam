import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { CandidateQueue } from "@/components/admin/candidate-queue";
import { CalibrationCard } from "@/components/admin/calibration-card";
import { calibration } from "@/lib/enrichment/calibration";
import { reviewPolicy } from "@/lib/enrichment/review-policy";

/** 검수 큐. 초안은 여기서 승인해야 booth_enrichment로 간다. */
export default async function AdminEnrichmentPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());

  const candidates = exhibition
    ? await repo.listEnrichmentCandidates({
        exhibitionId: exhibition.id,
        status: "pending",
        limit: 100,
      })
    : [];
  // 보정 표는 **판단된 것 전부**를 봐야 한다 — pending만으론 승인률이 안 나온다.
  const reviewed = exhibition
    ? await repo.listEnrichmentCandidates({
        exhibitionId: exhibition.id,
        limit: 1000,
      })
    : [];
  const cal = calibration(reviewed);
  const autoPassCount = candidates.filter(
    (c) => reviewPolicy(c.confidence, c.issues).wouldAutoPass,
  ).length;

  const booths = exhibition
    ? await repo.listBoothsByExhibitionId(exhibition.id)
    : [];
  const boothNames = Object.fromEntries(
    booths.map((b) => [b.id, `${b.code ?? ""} ${b.name}`.trim()]),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">초안 검수</h1>
        <p className="text-sm text-muted-foreground">
          자동 초안은 여기서 승인해야 부스에 반영됩니다. 고친 내용은 변경 이력에
          남아 다음 초안을 더 좋게 만듭니다.
        </p>
      </header>
      <CalibrationCard cal={cal} />

      <CandidateQueue
        candidates={candidates}
        boothNames={boothNames}
        slug={exhibition?.slug ?? ""}
        autoPassCount={autoPassCount}
      />
    </div>
  );
}
