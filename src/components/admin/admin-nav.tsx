"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Store,
  CalendarClock,
  BarChart3,
  Compass,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/common/theme-toggle";

const ITEMS = [
  { href: "/admin", label: "개요", icon: LayoutDashboard, exact: true },
  { href: "/admin/exhibitions", label: "전시", icon: Building2 },
  { href: "/admin/booths", label: "부스", icon: Store },
  { href: "/admin/events", label: "이벤트", icon: CalendarClock },
  { href: "/admin/analytics", label: "분석", icon: BarChart3 },
];

function useActive() {
  const pathname = usePathname();
  return (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);
}

export function AdminSidebar() {
  const isActive = useActive();
  return (
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-card px-3 py-5 md:flex">
      <Link
        href="/admin"
        className="mb-6 flex items-center gap-2 px-2 text-lg font-extrabold"
      >
        <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Compass className="size-4.5" />
        </span>
        Roam{" "}
        <span className="text-sm font-semibold text-muted-foreground">
          Admin
        </span>
      </Link>
      <nav className="flex flex-1 flex-col gap-1">
        {ITEMS.map((it) => {
          const active = isActive(it.href, it.exact);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary",
              )}
              aria-current={active ? "page" : undefined}
            >
              <it.icon className="size-5" />
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center justify-between px-2">
        <Link
          href="/"
          className="text-xs text-muted-foreground hover:underline"
        >
          방문자 화면 →
        </Link>
        <ThemeToggle />
      </div>
    </aside>
  );
}

export function AdminTopNav() {
  const isActive = useActive();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl md:hidden">
      <div className="flex h-14 items-center justify-between px-4 pt-safe">
        <Link
          href="/admin"
          className="flex items-center gap-1.5 font-extrabold"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Compass className="size-4" />
          </span>
          Roam Admin
        </Link>
        <ThemeToggle />
      </div>
      <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2">
        {ITEMS.map((it) => {
          const active = isActive(it.href, it.exact);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-foreground",
              )}
            >
              <it.icon className="size-4" />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
