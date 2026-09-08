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
  // 0.60 아래는 사람 큐에 올리지 않는다 — 근거를 못 찾은 글은 검수자가 봐도
  // 할 게 없다. 기계가 세 각도로 다시 찾고도 못 찾았다는 뜻이라, 사람이
  // **직접 조사할 목록**으로 따로 보여준다.
  const forHuman = candidates.filter(
    (c) => reviewPolicy(c.confidence, c.issues).decision !== "redraft",
  );
  const notFound = candidates.filter(
    (c) => reviewPolicy(c.confidence, c.issues).decision === "redraft",
  );
  const autoPassCount = forHuman.filter(
    (c) => reviewPolicy(c.confidence, c.issues).wouldAutoPass,
  ).length;

  // 진행률은 **전 필드를 가져오는 조회**로 센다 — listBoothsByExhibitionId는
  // 컬럼을 좁혀서 enrichment가 늘 비어 보인다("없음"과 "비어 있음"의 그 함정).
  const booths = exhibition ? await repo.listBoothsFull(exhibition.id) : [];
  const exhibitors = booths.filter((b) => b.kind !== "facility");
  const filled = exhibitors.filter((b) => b.enrichment?.summary?.trim()).length;
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
      {exhibition && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold">{exhibition.name} 채움 현황</p>
            <p className="text-sm text-muted-foreground">
              <span className="text-lg font-extrabold text-foreground">{filled}</span>
              {" / "}
              {exhibitors.length}곳
              <span className="ml-2">
                ({exhibitors.length ? Math.round((filled / exhibitors.length) * 100) : 0}%)
              </span>
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{
                width: `${exhibitors.length ? (filled / exhibitors.length) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            시설 {booths.length - exhibitors.length}곳은 참가사가 아니라 셈에서 뺐습니다 ·
            남은 {exhibitors.length - filled}곳 · 검수 대기 {forHuman.length}건
            {notFound.length > 0 && ` · 못 찾음 ${notFound.length}건`}
          </p>
        </div>
      )}
      <CalibrationCard cal={cal} />

      {notFound.length > 0 && (
        <div className="rounded-2xl border border-warning/40 bg-warning/5 p-4">
          <p className="text-sm font-semibold">
            기계가 못 찾은 곳 {notFound.length}곳
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            세 각도로 다시 검색해도 신뢰도가 0.60을 넘지 못했습니다. 웹에 근거가
            없다는 뜻이라 검수 큐에 올리지 않았습니다 — 인스타·브랜드 사이트를
            직접 찾아 <code>data/verified/</code>에 적으면 대조 검수로 들어옵니다.
          </p>
          <p className="mt-2 text-sm">
            {notFound
              .map((c) => boothNames[c.boothId] ?? c.boothId)
              .join(" · ")}
          </p>
        </div>
      )}

      <CandidateQueue
        candidates={forHuman}
        boothNames={boothNames}
        slug={exhibition?.slug ?? ""}
        autoPassCount={autoPassCount}
      />
    </div>
  );
}
