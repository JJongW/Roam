import Link from "next/link";
import { getRepository } from "@/lib/repositories";
import { getAdminFairScope } from "@/lib/admin/fair-scope";
import { AdminFairHeader } from "@/components/admin/admin-fair-header";
import { verifyQueue } from "@/lib/admin/queues";
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
  const { exhibitions, exhibition } = await getAdminFairScope();

  // 관리자 홈의 "대조 검수 대기"와 같은 함수다(lib/admin/queues.ts).
  const diff = exhibition ? await verifyQueue(repo, exhibition) : { verified: {}, rows: [], same: 0 };
  const verified = diff.verified;
  const same = diff.same;
  const rows: VerifyRow[] = diff.rows.map(({ booth: b, current, verified: v }) => ({
    boothId: b.id,
    code: b.code ?? "",
    name: b.name,
    // 대조는 요약만이 아니라 초안 전체로 한다.
    current: { ...(b.enrichment ?? {}), summary: current },
    verified: v,
  }));
  rows.sort(
    (a, b) =>
      Number(Boolean(b.verified.instagram)) - Number(Boolean(a.verified.instagram)) ||
      Number(Boolean(b.verified.confirmed)) - Number(Boolean(a.verified.confirmed)) ||
      a.code.localeCompare(b.code),
  );

  return (
    <div className="space-y-6">
      <AdminFairHeader
        title="대조 검수"
        exhibitions={exhibitions}
        exhibition={exhibition}
        description="자동 초안이 쓴 글과 사람이 직접 확인한 글이 다를 때, 무엇이 맞는지 골라요. 인스타가 늘 옳은 것도 아니라 한 건씩 봐요."
      >
        <p className="text-sm">
          <Link href="/admin/brands/links" className="underline">같은 브랜드인지는 브랜드의 연결 확인에서 골라요 →</Link>
        </p>
      </AdminFairHeader>

      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <p>
          확인한 사실 <b>{Object.keys(verified).length}</b>곳, 다른 것{" "}
          <b className="text-warning">{rows.length}</b>곳, 같거나 이미 반영{" "}
          <b>{same}</b>곳
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          &lsquo;본인 확인&rsquo;은 브랜드가 자기 계정에서 이 행사 참여를 직접
          밝힌 경우예요. 참여 여부만큼은 100%예요.
        </p>
      </div>

      <VerifyQueue rows={rows} />
    </div>
  );
}
