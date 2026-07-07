"use client";

import { useEffect, useState } from "react";
import {
  Footprints,
  MapPin,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { InterestNode, UserBrain } from "@/lib/types";

/**
 * 내 취향/안목 화면. L4 브레인(누적 관심·방문 통계)을 보여줘 "쓸수록 좋아짐"을
 * 눈에 보이게 한다(companion-reframe §5-f). 회고 시트와 짝 — 회고=순간, 이건 누적된 나.
 */
export function BrainSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [brain, setBrain] = useState<UserBrain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get<{ data: UserBrain }>("/api/me/brain")
      .then((r) => {
        if (!cancelled) setBrain(r.data);
      })
      .catch(() => {
        if (!cancelled) setBrain(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const empty =
    brain && brain.interests.length === 0 && brain.literacy.visitsCount === 0;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="px-5 pb-8">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden />내 취향
          </SheetTitle>
          <SheetDescription>둘러볼수록 내 취향이 쌓여.</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mt-4 space-y-2" aria-label="취향 불러오는 중">
            <div className="h-4 w-1/2 animate-pulse rounded bg-secondary" />
            <div className="h-14 w-full animate-pulse rounded-xl bg-secondary" />
            <div className="h-14 w-full animate-pulse rounded-xl bg-secondary" />
          </div>
        ) : empty || !brain ? (
          <p className="mb-2 mt-8 text-center text-sm leading-relaxed text-muted-foreground">
            아직 기록이 없어.
            <br />몇 곳 둘러보면 여기 네 취향이 그려질 거야.
          </p>
        ) : (
          <div className="mt-4 max-h-[58dvh] space-y-4 overflow-y-auto">
            <div className="flex items-center gap-3 px-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-4" aria-hidden /> 관람{" "}
                {brain.literacy.visitsCount}회
              </span>
              <span className="flex items-center gap-1">
                <Footprints className="size-4" aria-hidden /> 본 부스{" "}
                {brain.literacy.boothsSeenCount}곳
              </span>
            </div>

            <div className="space-y-2">
              {brain.interests.map((n) => (
                <div
                  key={n.key}
                  className="rounded-xl border border-border bg-card p-3"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{n.label}</span>
                    <TrendTag trend={n.trend} />
                  </div>
                  <Progress value={Math.round(n.confidence * 100)} />
                </div>
              ))}
            </div>
          </div>
        )}

        <Button size="lg" className="mt-5 w-full" onClick={onClose}>
          닫기
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function TrendTag({ trend }: { trend: InterestNode["trend"] }) {
  if (trend === "up")
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-success">
        <TrendingUp className="size-3.5" aria-hidden /> 느는 중
      </span>
    );
  if (trend === "down")
    return (
      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <TrendingDown className="size-3.5" aria-hidden /> 주는 중
      </span>
    );
  return (
    <Minus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
  );
}
