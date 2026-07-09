"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

type TabKey = "intro" | "record" | "reviews" | "posts";

const TAB_KEYS: { key: TabKey; i18nKey: string }[] = [
  { key: "intro", i18nKey: "booth.tabIntro" },
  { key: "record", i18nKey: "booth.tabRecord" },
  { key: "reviews", i18nKey: "booth.tabReviews" },
  { key: "posts", i18nKey: "booth.tabPosts" },
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
  const tr = useT();
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
        className="sticky top-14 z-30 -mx-5 flex gap-1 border-b border-border bg-background/90 px-5 backdrop-blur-xl landscape:top-0"
      >
        {TAB_KEYS.map((tk) => (
          <button
            key={tk.key}
            type="button"
            role="tab"
            aria-selected={tab === tk.key}
            onClick={() => setTab(tk.key)}
            className={cn(
              "relative flex-1 py-3 text-sm font-bold transition-colors",
              tab === tk.key ? "text-primary" : "text-muted-foreground",
            )}
          >
            {tr(tk.i18nKey)}
            {tab === tk.key && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
            )}
          </button>
        ))}
      </div>
      <div className="pt-5">{panels[tab]}</div>
    </div>
  );
}
