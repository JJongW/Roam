import { getAdminFairScope } from "@/lib/admin/fair-scope";
import { AdminFairHeader } from "@/components/admin/admin-fair-header";
import { TimelineView } from "@/components/admin/timeline-view";

export const metadata = { title: "타임라인" };

/** 이벤트는 /api/admin/timeline이 같은 쿠키로 고른 박람회 기준으로 준다. */
export default async function AdminTimelinePage() {
  const { exhibitions, exhibition } = await getAdminFairScope();
  return (
    <div className="space-y-6">
      <AdminFairHeader
        title="타임라인"
        exhibitions={exhibitions}
        exhibition={exhibition}
        description="부스 반응과 페이지 조회 원시 이벤트(최신순)"
      />
      <TimelineView />
    </div>
  );
}
