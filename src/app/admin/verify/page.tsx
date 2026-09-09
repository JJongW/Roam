import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { loadVerified, sameText } from "@/lib/verified";
import { VerifyQueue, type VerifyRow } from "@/components/admin/verify-queue";

/**
 * 대조 검수 — 운영에 있는 글과 사람이 확인한 글을 나란히 놓고 고른다.
 *
 * 인입은 "빈 칸만 채운다"라 이미 값이 있는 자리는 못 건드리고, 일괄로 덮으면
 * 멀쩡한 글까지 망가진다. 실제로 싸이벡은 자동 초안이 더 정확했고 라잇트리는
 * 완전히 틀렸다 — 한 건씩 봐야 갈린다.
 */
export default async function AdminVerifyPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());

  const verified = exhibition ? loadVerified(exhibition.slug) : {};
  const booths = exhibition ? await repo.listBoothsFull(exhibition.id) : [];

  const rows: VerifyRow[] = [];
  let same = 0;
  for (const b of booths) {
    const v = b.code ? verified[b.code] : undefined;
    if (!v?.summary) continue;
    const current = b.enrichment?.summary ?? "";
    // 같은 말이면 볼 게 없다. 운영이 비어 있으면 인입이 이미 채웠거나 채울 자리다.
    if (!current || sameText(current, v.summary)) {
      same++;
      continue;
    }
    rows.push({
      boothId: b.id,
      code: b.code ?? "",
      name: b.name,
      // 대조는 요약만이 아니라 초안 전체로 한다.
      current: { ...(b.enrichment ?? {}), summary: current },
      verified: v,
    });
  }
  rows.sort(
    (a, b) =>
      Number(Boolean(b.verified.instagram)) - Number(Boolean(a.verified.instagram)) ||
      Number(Boolean(b.verified.confirmed)) - Number(Boolean(a.verified.confirmed)) ||
      a.code.localeCompare(b.code),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">대조 검수</h1>
        <p className="text-sm text-muted-foreground">
          자동 초안이 쓴 글과 사람이 직접 확인한 글이 다를 때, 무엇이 맞는지
          고릅니다. 인스타가 늘 옳은 것도 아니라 한 건씩 봅니다.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p>
          확인한 사실 <b>{Object.keys(verified).length}</b>곳 · 다른 것{" "}
          <b className="text-warning">{rows.length}</b>곳 · 같거나 이미 반영{" "}
          <b>{same}</b>곳
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          &lsquo;본인 확인&rsquo;은 브랜드가 자기 계정에서 이 전시 참여를 직접
          밝힌 경우입니다 — 참여 여부만큼은 100%입니다.
        </p>
      </div>

      <VerifyQueue rows={rows} />
    </div>
  );
}
