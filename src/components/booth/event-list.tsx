"use client";

import { useState } from "react";
import { Calendar, Clock, Gift, Bell, BellRing } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { isPushSupported, requestPermission, registerForPush, scheduleReminder } from "@/lib/push/notify";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { BoothEvent } from "@/lib/types";

function isLiveNow(e: BoothEvent, now = Date.now()) {
  return Date.parse(e.startTime) <= now && Date.parse(e.endTime) >= now;
}

export function EventList({ events }: { events: BoothEvent[] }) {
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  async function remind(e: BoothEvent) {
    if (!isPushSupported()) {
      toast.error("이 브라우저는 알림을 지원하지 않아요");
      return;
    }
    const perm = await requestPermission();
    if (perm !== "granted") {
      toast.error("알림 권한이 필요해요");
      return;
    }
    await registerForPush();
    await api.post("/api/bookmarks", { targetType: "event", targetId: e.id }).catch(() => {});
    scheduleReminder(`${e.title} 곧 시작`, "북마크한 이벤트가 곧 시작돼요.", Date.parse(e.startTime));
    setReminded((s) => new Set(s).add(e.id));
    toast.success("이벤트 알림을 예약했어요");
  }

  return (
    <ul className="space-y-2.5">
      {events.map((e) => {
        const live = isLiveNow(e);
        const on = reminded.has(e.id);
        return (
          <li key={e.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Calendar className="size-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold">{e.title}</p>
                  {live && <Badge variant="destructive">진행 중</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{e.description}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <Clock className="size-3.5" />
                    {format(new Date(e.startTime), "M.d HH:mm")} – {format(new Date(e.endTime), "HH:mm")}
                  </span>
                  {e.rewardInfo && (
                    <span className="inline-flex items-center gap-1 font-semibold text-primary">
                      <Gift className="size-3.5" /> {e.rewardInfo}
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant={on ? "secondary" : "outline"}
                size="sm"
                onClick={() => remind(e)}
                aria-label="이벤트 알림 받기"
                className={cn("shrink-0", on && "text-primary")}
              >
                {on ? <BellRing className="size-4" /> : <Bell className="size-4" />}
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
