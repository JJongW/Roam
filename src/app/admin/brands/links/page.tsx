import { getRepository } from "@/lib/repositories";
import { brandLinkRows } from "@/lib/admin/queues";
import { LinkQueue } from "@/components/admin/brands/link-queue";

export const metadata = { title: "연결 확인" };

/**
 * 연결 확인 목록 — "이 참가를 이 브랜드에 이어도 될까요?"(2026-11-03 Ted 결정).
 * 예전 /admin/verify/brands가 하던 일이다. 인스타나 웹 주소가 같은 곳은 백필이 이미
 * 이었고, 여기 오는 건 이름만 같은 짝이다. 연결 안 함으로 둔 짝은 다시 묻지 않는다.
 * 판단 단위는 참가다. 부스가 없는 참가도 줄이 된다(2026-11-20 Ted, 0073).
 * 관리자 홈 "브랜드 확인 대기"와 같은 함수(lib/admin/queues.ts)를 부른다.
 */
export default async function BrandLinksPage() {
  const repo = await getRepository();
  const [rows, rejected] = await Promise.all([brandLinkRows(repo), repo.listExhibitorLinkCandidates("rejected")]);
  return <LinkQueue rows={rows} rejectedCount={rejected.length} />;
}
