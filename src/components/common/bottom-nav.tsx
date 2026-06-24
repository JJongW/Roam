"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Map as MapIcon, Route as RouteIcon, MessagesSquare } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primary bottom navigation for an exhibition: 지도 · 다른 동선 · 커뮤니티.
 * These are the top-level destinations within a fair; the active tab is derived
 * from the path. Fixed to the bottom with safe-area padding.
 */
export function BottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/exhibitions/${slug}`;
  const tabs = [
    { href: `${base}/map`, label: "지도", icon: MapIcon },
    { href: `${base}/routes`, label: "다른 동선", icon: RouteIcon },
    { href: `${base}/community`, label: "커뮤니티", icon: MessagesSquare },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-md border-t border-border bg-background/95 pb-safe backdrop-blur-xl md:max-w-none landscape:max-w-none">
      {tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-semibold transition-colors",
              active ? "text-primary" : "text-muted-foreground",
            )}
          >
            <Icon className="size-5" />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
