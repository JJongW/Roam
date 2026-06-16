import { AdminSidebar, AdminTopNav } from "@/components/admin/admin-nav";

export const metadata = { title: "Admin" };

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
