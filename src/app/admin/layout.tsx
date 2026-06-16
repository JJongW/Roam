import { AdminSidebar, AdminTopNav } from "@/components/admin/admin-nav";
import { AdminUnlock } from "@/components/admin/admin-unlock";
import { isAdminAuthed } from "@/lib/api/http";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Organizer gate: when ORGANIZER_CODE is set, require the code (cookie) first.
  if (!(await isAdminAuthed())) return <AdminUnlock />;
  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopNav />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
