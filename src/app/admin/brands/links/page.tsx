import { getRepository } from "@/lib/repositories";
import { loadBrandData } from "@/lib/brands/load";
import { buildLinkRows } from "@/lib/brands/links";
import { LinkQueue } from "@/components/admin/brands/link-queue";

export const metadata = { title: "연결 확인" };

/**
 * 연결 확인 목록 — "이 출전을 이 브랜드에 이어도 될까요?"(2026-11-03 Ted 결정).
 * 예전 /admin/verify/brands가 하던 일이다. 인스타나 웹 주소가 같은 곳은 백필이 이미
 * 이었고, 여기 오는 건 이름만 같은 짝이다. 연결 안 함으로 둔 짝은 다시 묻지 않는다.
 */
export default async function BrandLinksPage() {
  const repo = await getRepository();
  const [data, pending, rejected] = await Promise.all([
    loadBrandData(repo),
    repo.listExhibitorLinkCandidates("pending"),
    repo.listExhibitorLinkCandidates("rejected"),
  ]);
  const rows = buildLinkRows({ ...data, candidates: pending });
  return <LinkQueue rows={rows} rejectedCount={rejected.length} />;
}
