import { describe, expect, it } from "vitest";
import { sifBooths } from "@/lib/mock/seed-sif";
import { anchorKey } from "./identity";
import { planExhibitorLinks } from "./plan";

/**
 * V.21(서울일러스트레이션페어 2026, `links-sif-2026.json`)을 운영과 같은 판정으로 백필한다.
 * 2026-11-20: 링크 모음 서비스(link.inpock.co.kr, instabio.cc, grafolio 등)를 도메인으로 맞대서
 * "러브미모어" 아래 27곳, "무운" 17곳, "달콤한 일러스트" 13곳이 한 브랜드로 뭉쳤다.
 * 서로 다른 인스타 계정이 한 브랜드에 붙으면 뭉친 것이다.
 */
function backfillGroups() {
  const booths = sifBooths.filter((b) => b.kind !== "facility");
  const plan = planExhibitorLinks({
    booths: booths.map((b) => ({
      id: b.id,
      exhibitionId: b.exhibitionId,
      name: b.name,
      kind: b.kind,
      instagramUrl: b.instagramUrl,
      websiteUrl: b.websiteUrl,
    })),
  });
  const exhibitorOfParticipant = new Map(
    plan.participants.map((p) => [p.key, "new" in p.exhibitorRef ? p.exhibitorRef.new : p.exhibitorRef.existing]),
  );
  const byId = new Map(booths.map((b) => [b.id, b]));
  const groups = new Map<string, typeof booths>();
  for (const a of plan.assignments) {
    const pk = "new" in a.participantRef ? a.participantRef.new : a.participantRef.existing;
    const ex = exhibitorOfParticipant.get(pk)!;
    if (!groups.has(ex)) groups.set(ex, []);
    groups.get(ex)!.push(byId.get(a.boothId)!);
  }
  return [...groups.values()];
}

describe("V.21 백필 — 링크 모음 서비스로 뭉치지 않는다", () => {
  it("서로 다른 인스타 계정이 한 브랜드에 붙지 않는다", () => {
    const merged = backfillGroups().filter((members) => {
      const ig = new Set(members.map((m) => (m.instagramUrl ? anchorKey(m.instagramUrl)?.match : null)).filter(Boolean));
      return ig.size > 1;
    });
    if (merged.length) {
      console.log(
        `뭉친 브랜드 ${merged.length}곳, 부스 ${merged.reduce((n, m) => n + m.length, 0)}곳\n` +
          merged
            .sort((a, b) => b.length - a.length)
            .map((m) => `${m.length}\t${m[0].name}\t${[...new Set(m.map((x) => x.websiteUrl))].slice(0, 3).join(" ")}`)
            .join("\n"),
      );
    }
    expect(merged.map((m) => m.map((x) => x.name))).toEqual([]);
  });
});
