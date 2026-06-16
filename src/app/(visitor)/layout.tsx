export default function VisitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background"
    >
      {children}
    </div>
  );
}
