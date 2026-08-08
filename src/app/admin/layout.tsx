import { cookies } from "next/headers";
import { AdminSidebar, AdminTopNav } from "@/components/admin/admin-nav";
import { AdminUnlock } from "@/components/admin/admin-unlock";
import { ExhibitionSwitcher } from "@/components/admin/exhibition-switcher";
import { isAdminAuthed } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Organizer gate: when ORGANIZER_CODE is set, require the code (cookie) first.
  if (!(await isAdminAuthed())) return <AdminUnlock />;

  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const selectedId = (await cookies()).get("admin_exhibition_id")?.value;

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopNav />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-[var(--spacing-global-gutter)] py-6 md:px-8"
        >
          <div className="mb-5">
            <ExhibitionSwitcher exhibitions={exhibitions} selectedId={selectedId} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
