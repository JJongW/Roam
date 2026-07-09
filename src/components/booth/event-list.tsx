"use client";

import { useState } from "react";
import { Clock, Mic, Bell, BellRing } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import {
  isPushSupported,
  requestPermission,
  registerForPush,
  scheduleReminder,
} from "@/lib/push/notify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/lib/i18n/provider";
import type { BoothEvent } from "@/lib/types";

function isLiveNow(e: BoothEvent, now = Date.now()) {
  return Date.parse(e.startTime) <= now && Date.parse(e.endTime) >= now;
}

/** "상시" group first, then one group per date (sorted), each sorted by time. */
function groupByDate(events: BoothEvent[], t: ReturnType<typeof useT>) {
  const weekday = t("event.weekdays").split(",");
  const dateFmt = t("event.dateFmt");
  const standing = events.filter((e) => e.standing);
  const timed = events.filter((e) => !e.standing);
  const byDate = new Map<string, BoothEvent[]>();
  for (const e of timed) {
    const key = format(new Date(e.startTime), "yyyy-MM-dd");
    (byDate.get(key) ?? byDate.set(key, []).get(key)!).push(e);
  }
  const groups: { label: string; events: BoothEvent[] }[] = [];
  if (standing.length)
    groups.push({ label: t("event.standing"), events: standing });
  for (const key of [...byDate.keys()].sort()) {
    const d = new Date(`${key}T00:00:00+09:00`);
    groups.push({
      label: `${format(d, dateFmt)} (${weekday[d.getDay()]})`,
      events: byDate
        .get(key)!
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    });
  }
  return groups;
}

export function EventList({ events }: { events: BoothEvent[] }) {
  const t = useT();
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  async function remind(e: BoothEvent) {
    if (!isPushSupported()) {
      toast.error(t("event.noSupport"));
      return;
    }
    const perm = await requestPermission();
    if (perm !== "granted") {
      toast.error(t("event.needPermission"));
      return;
    }
    await registerForPush();
    await api
      .post("/api/bookmarks", { targetType: "event", targetId: e.id })
      .catch(() => {});
    scheduleReminder(e.title, t("event.bookmarkSoon"), Date.parse(e.startTime));
    setReminded((s) => new Set(s).add(e.id));
    toast.success(t("event.notifScheduled"));
  }

  const groups = groupByDate(events, t);

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.label} className="space-y-2.5">
          <h3 className="text-sm font-bold text-muted-foreground">{g.label}</h3>
          <ul className="space-y-2.5">
            {g.events.map((e) => {
              const live = !e.standing && isLiveNow(e);
              const on = reminded.has(e.id);
              return (
                <li
                  key={e.id}
                  className="rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        {e.tag && (
                          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-bold text-secondary-foreground">
                            {e.tag}
                          </span>
                        )}
                        {live && (
                          <Badge variant="destructive">
                            {t("event.inProgress")}
                          </Badge>
                        )}
                      </div>
                      <p className="font-bold leading-snug">{e.title}</p>
                      {e.speaker && (
                        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
                          <Mic className="mt-0.5 size-3.5 shrink-0" />
                          <span>{e.speaker}</span>
                        </p>
                      )}
                      {e.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {e.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3.5" />
                        {e.standing
                          ? t("event.standingOp")
                          : `${format(new Date(e.startTime), "HH:mm")} – ${format(new Date(e.endTime), "HH:mm")}`}
                      </div>
                    </div>
                    {!e.standing && (
                      <Button
                        variant={on ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => remind(e)}
                        aria-label={t("event.notifBtn")}
                        className={cn("shrink-0", on && "text-primary")}
                      >
                        {on ? (
                          <BellRing className="size-4" />
                        ) : (
                          <Bell className="size-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
