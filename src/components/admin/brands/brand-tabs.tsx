"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function BrandTabs({ pending }: { pending: number }) {
  const pathname = usePathname();
  const onLinks = pathname.startsWith("/admin/brands/links");
  const tab = (href: string, label: React.ReactNode, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
  return (
    <nav className="inline-flex gap-1 rounded-xl bg-secondary p-1" aria-label="브랜드 화면">
      {tab("/admin/brands", "브랜드 목록", !onLinks)}
      {tab(
        "/admin/brands/links",
        <>
          연결 확인
          {pending > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">{pending}</span>
          )}
        </>,
        onLinks,
      )}
    </nav>
  );
}
