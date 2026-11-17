import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { loadContactBoard } from "@/lib/brands/board-load";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { ContactBoard } from "@/components/admin/brands/contact-board";
import { EmptyState } from "@/components/common/states";

export const metadata = { title: "브랜드 연락 현황" };

type Props = { searchParams: Promise<{ fair?: string }> };

/**
 * 브랜드 연락 현황 — 박람회 하나의 모든 브랜드가 사진 허락 연락에서 어디쯤인지 한눈에 보고
 * 한 번 눌러 고친다(2026-11-17 Ted: "현황 체크를 쉽게 할 수 있어야"). 보내기는 사람이 한다.
 * 박람회는 `?fair=`로 고르고, 없으면 관리자 상단에서 고른 박람회(쿠키)를 쓴다.
 */
export default async function BrandContactsPage({ searchParams }: Props) {
  const { fair } = await searchParams;
  const repo = await getRepository();
  const today = todayISO();
  const exhibitions = [...(await repo.listExhibitions({ limit: 500 })).data].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition =
    exhibitions.find((e) => e.id === fair || e.slug === fair) ?? resolveAdminExhibition(exhibitions, cookieId, today);
  if (!exhibition) return <EmptyState title="박람회가 없어요" description="행사 메뉴에서 박람회를 먼저 만들어 주세요." bordered />;
  const { rows, mode, unlinkedBooths } = await loadContactBoard(repo, exhibition, today);
  return (
    <ContactBoard
      key={exhibition.id}
      exhibition={{ id: exhibition.id, slug: exhibition.slug, name: exhibition.name }}
      exhibitions={exhibitions.map((e) => ({ id: e.id, name: e.name }))}
      initialRows={rows}
      mode={mode}
      unlinkedBooths={unlinkedBooths}
      today={today}
    />
  );
}
