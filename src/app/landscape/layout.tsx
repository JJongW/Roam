/**
 * Landscape shell. Unlike the portrait visitor layout (max-w-md phone column),
 * this fills the full width for wide / rotated displays (tablets, kiosks). Same
 * data + API + DB as the portrait app — only the presentation differs. Pages
 * under /landscape are the wide-screen variant; share the same Supabase env, so
 * booths/routes/users are identical across both.
 */
export default function LandscapeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="main"
      className="flex min-h-dvh w-full flex-col bg-background"
    >
      {children}
    </div>
  );
}
