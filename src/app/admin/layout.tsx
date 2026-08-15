import { cookies } from "next/headers";
import { AdminSidebar, AdminTopNav } from "@/components/admin/admin-nav";
import { AdminUnlock } from "@/components/admin/admin-unlock";
import { ExhibitionSwitcher } from "@/components/admin/exhibition-switcher";
import { isAdminAuthed } from "@/lib/api/http";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { adminEmailGateActive } from "@/lib/env";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 게이트: ADMIN_EMAILS(이메일 화이트리스트)가 있으면 Google 로그인, 없으면
  // ORGANIZER_CODE(조직자 코드) — isAdminAuthed와 같은 우선순위.
  if (!(await isAdminAuthed())) {
    return <AdminUnlock useGoogle={adminEmailGateActive} />;
  }

  const exhibitions = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const resolved = resolveAdminExhibition(
    exhibitions.data,
    cookieId,
    todayISO(),
  );

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopNav />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-[var(--spacing-global-gutter)] py-6 md:px-8"
        >
          <ExhibitionSwitcher
            exhibitions={exhibitions.data}
            selectedId={resolved?.id}
          />
          {children}
        </main>
      </div>
    </div>
  );
}
