import { listExhibitionsCached } from "@/lib/repositories/cached";
import { VisitedList } from "@/components/booth-v2/visited-list";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.visitedList };

/**
 * UI 6-10 "다녀왔어요" 목록. 기록은 기기(로그인하면 계정과 합친 것)에 있어 클라이언트가 그린다.
 * 서버는 박람회 이름과 행사장만 넘긴다.
 */
export default async function VisitedPage() {
  const page = await listExhibitionsCached().catch(() => null);
  const fairs = (page?.data ?? []).map((e) => ({ id: e.id, slug: e.slug, name: e.name, venue: e.venue }));
  return <VisitedList fairs={fairs} />;
}
