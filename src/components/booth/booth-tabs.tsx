"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type TabKey = "intro" | "record" | "reviews" | "posts";

const TABS: { key: TabKey; label: string }[] = [
  { key: "intro", label: "소개" },
  { key: "record", label: "나의 기록" },
  { key: "reviews", label: "리뷰" },
  { key: "posts", label: "방문자" },
];

/**
 * Consolidates the booth detail into tabs (소개 · 나의 기록 · 리뷰 · 방문자) so
 * the page doesn't dump everything in one long scroll. Each panel is rendered
 * server-side and passed in; this only switches which one shows.
 */
export function BoothTabs({
  intro,
  record,
  reviews,
  posts,
}: {
  intro: React.ReactNode;
  record: React.ReactNode;
  reviews: React.ReactNode;
  posts: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>("intro");
  const panels: Record<TabKey, React.ReactNode> = {
    intro,
    record,
    reviews,
    posts,
  };

  return (
    <div>
      <div
        role="tablist"
        className="sticky top-14 z-30 -mx-5 flex gap-1 border-b border-border bg-background/90 px-5 backdrop-blur-xl"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "relative flex-1 py-3 text-sm font-bold transition-colors",
              tab === t.key ? "text-primary" : "text-muted-foreground",
            )}
          >
            {t.label}
            {tab === t.key && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>
      <div className="pt-5">{panels[tab]}</div>
    </div>
  );
}
