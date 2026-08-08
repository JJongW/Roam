"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/common/states";
import { TimelineRow } from "@/components/admin/timeline-row";
import { buildTimeline, type TimelineEvent } from "@/lib/admin/timeline";
import type { AnalyticsEvent, Booth, Exhibition, User, UserSignal } from "@/lib/types";

export default function AdminTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exhibitionId, setExhibitionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ exhibition, signals, analytics, booths }, { users }] = await Promise.all([
      api.get<{
        exhibition: Exhibition | null;
        signals: UserSignal[];
        analytics: AnalyticsEvent[];
        booths: Booth[];
      }>("/api/admin/timeline"),
      api.get<{ users: User[] }>("/api/admin/users"),
    ]);
    if (!exhibition) {
      setExhibitionId(null);
      setLoading(false);
      return;
    }
    setExhibitionId(exhibition.id);
    const nicknames = new Map(users.map((u) => [u.id, u.nickname]));
    const byCode = new Map(
      booths.filter((b) => b.code).map((b) => [b.code as string, b.name]),
    );
    const byId = new Map(booths.map((b) => [b.id, b.name]));
    setEvents(buildTimeline(signals, analytics, nicknames, byCode, byId));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const labels = [...new Set(events.map((e) => e.label))];
  const filtered = events.filter(
    (e) => selected.size === 0 || selected.has(e.label),
  );

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">타임라인</h1>
          <p className="text-sm text-muted-foreground">
            부스 반응·페이지 조회 원시 이벤트(최신순)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="size-4" /> 새로고침
        </Button>
      </header>

      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <button key={label} type="button" onClick={() => toggle(label)}>
              <Chip variant={selected.has(label) ? "tint" : "outline"} size="sm">
                {label}
              </Chip>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : !exhibitionId ? (
        <EmptyState title="전시가 없어요" />
      ) : filtered.length === 0 ? (
        <EmptyState title="이벤트가 없어요" />
      ) : (
        <div className="rounded-xl border border-border bg-card px-4">
          {filtered.map((e) => (
            <TimelineRow key={`${e.source}-${e.id}`} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
