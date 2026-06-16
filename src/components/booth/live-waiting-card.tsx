"use client";

import { Users } from "lucide-react";
import { useLiveWaiting } from "@/lib/hooks/use-live-waiting";
import type { Waiting } from "@/lib/types";

export function LiveWaitingCard({ boothId, initial }: { boothId: string; initial?: Waiting | null }) {
  const { waiting, live } = useLiveWaiting(boothId, initial);
  if (!waiting?.enabled) return null;

  return (
    <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex size-11 items-center justify-center rounded-xl bg-secondary">
        <Users className="size-5 text-primary" />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold">현재 대기</p>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-success">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-70" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
            LIVE
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="tabular font-semibold text-foreground">{waiting.queueCount}팀</span> 대기 중 · 예상{" "}
          <span className="tabular font-semibold text-foreground">{waiting.estimatedMinutes}분</span>
          {live && <span className="ml-1 text-xs text-success">· 실시간 업데이트</span>}
        </p>
      </div>
    </section>
  );
}
