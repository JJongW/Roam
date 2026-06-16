"use client";

import { Users, Clock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { useLiveWaiting } from "@/lib/hooks/use-live-waiting";
import type { Waiting } from "@/lib/types";

function updatedLabel(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return formatDistanceToNow(d, { addSuffix: true, locale: ko });
}

export function LiveWaitingCard({
  boothId,
  initial,
}: {
  boothId: string;
  initial?: Waiting | null;
}) {
  const { waiting, live } = useLiveWaiting(boothId, initial);

  // Explicitly distinguish "seller doesn't provide waiting info" from "calm" —
  // a hidden card reads as no-queue, which misleads the visitor.
  if (!waiting?.enabled) {
    return (
      <section className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-4">
        <div className="flex size-11 items-center justify-center rounded-xl bg-secondary">
          <Users className="size-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold">대기 정보 미제공</p>
          <p className="text-sm text-muted-foreground">
            이 부스는 실시간 대기 정보를 제공하지 않아요.
          </p>
        </div>
      </section>
    );
  }

  const updated = updatedLabel(waiting.updatedAt);

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
          <span className="tabular font-semibold text-foreground">
            {waiting.queueCount}팀
          </span>{" "}
          대기 중 · 예상{" "}
          <span className="tabular font-semibold text-foreground">
            {waiting.estimatedMinutes}분
          </span>
        </p>
        {(live || updated) && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="size-3" aria-hidden />
            {live ? "실시간 업데이트" : updated ? `${updated} 기준` : null}
          </p>
        )}
      </div>
    </section>
  );
}
