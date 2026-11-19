import { AdminSidebar, AdminTopNav } from "@/components/admin/admin-nav";
import { AdminUnlock } from "@/components/admin/admin-unlock";
import { isAdminAuthed } from "@/lib/api/http";
import { adminEmailGateActive } from "@/lib/env";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 게이트: Google 로그인 + ADMIN_EMAILS. 운영에서 목록이 비면 닫힌다(isAdminAuthed).
  if (!(await isAdminAuthed())) {
    return <AdminUnlock useGoogle={adminEmailGateActive} />;
  }

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopNav />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-[var(--spacing-global-gutter)] py-6 md:px-8 has-[[data-admin-wide]]:max-w-6xl"
        >
          {/* 넓게 쓰는 화면은 맨 바깥에 data-admin-wide를 단다(지금은 홈뿐). 나머지 화면 폭은 그대로다. */}
          {/* 박람회 선택기는 여기 두지 않는다. 박람회 하나를 보는 화면만
              AdminFairHeader로 제목 옆에 그린다(src/lib/admin/fair-scope.ts). */}
          {children}
        </main>
      </div>
    </div>
  );
}
