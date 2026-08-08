import { cookies } from "next/headers";
import { AdminSidebar, AdminTopNav } from "@/components/admin/admin-nav";
import { AdminUnlock } from "@/components/admin/admin-unlock";
import { ExhibitionSwitcher } from "@/components/admin/exhibition-switcher";
import { isAdminAuthed } from "@/lib/api/http";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Organizer gate: when ORGANIZER_CODE is set, require the code (cookie) first.
  if (!(await isAdminAuthed())) return <AdminUnlock />;

  const exhibitions = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const resolved = resolveAdminExhibition(exhibitions.data, cookieId, todayISO());

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopNav />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-[var(--spacing-global-gutter)] py-6 md:px-8"
        >
          <ExhibitionSwitcher exhibitions={exhibitions.data} selectedId={resolved?.id} />
          {children}
        </main>
      </div>
    </div>
  );
}
