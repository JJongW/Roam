"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { api } from "@/lib/api/client";
import { RoamMotion } from "@/components/companion/roam-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { ValueChips } from "@/components/values/value-chips";
import type { VisitDigest } from "@/lib/types";

/**
 * 관람 종료 회고 화면. Companion(LLM/폴백) 서술 + 방문 요약을 보여줘 "충분히
 * 즐겼다"는 감각을 남긴다(peak-end). 열릴 때 GET /api/me/recap을 부른다
 * (서버가 서술을 lazy 생성·캐시하므로 잠깐 로딩).
 */
export function RecapSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [visit, setVisit] = useState<VisitDigest | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // loading 기본 true — 시트는 관람당 1회 열리므로 동기 리셋 불필요(cascading render 회피).
    api
      .get<{ data: VisitDigest | null }>("/api/me/recap")
      .then((r) => {
        if (!cancelled) setVisit(r.data);
      })
      .catch(() => {
        if (!cancelled) setVisit(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const text = visit?.narrative ?? visit?.summary ?? null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="px-5 pb-8">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
              <RoamMotion src="/walk_see.mp4" />
            </span>
            오늘의 관람
          </SheetTitle>
          <SheetDescription>함께한 하루를 돌아봤어.</SheetDescription>
        </SheetHeader>

        <div className="mt-4 rounded-2xl border border-primary/25 bg-accent/40 p-4">
          {loading ? (
            <div className="space-y-2" aria-label="회고 불러오는 중">
              <div className="h-4 w-full animate-pulse rounded bg-secondary" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-secondary" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-secondary" />
            </div>
          ) : (
            <p className="text-[15px] font-medium leading-relaxed text-foreground/90">
              {text ?? "오늘도 고생 많았어. 다음에 또 함께 둘러보자."}
            </p>
          )}
        </div>

        {!loading && visit && visit.boothsVisited.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden />
            {visit.boothsVisited.length}곳을 둘러봤어
          </div>
        )}

        {/* A(서사) 위에 오늘 남긴 가치 — 목표 대비 무엇을 봤나. */}
        {!loading && visit && visit.themesEngaged.length > 0 && (
          <div className="mt-3 px-1">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              오늘 남긴 가치
            </p>
            <ValueChips
              tags={visit.themesEngaged.map((slug) => ({ slug, strength: 1 }))}
              max={5}
            />
          </div>
        )}

        {/* C(다음으로 잇기) — 종단 프로필 연결. */}
        {!loading && visit && (
          <p className="mt-4 rounded-xl border border-border bg-card p-3 text-sm leading-relaxed text-muted-foreground">
            네 취향에 오늘 관람이 쌓였어 — 다음 박람회는 더 잘 맞춰줄게.
          </p>
        )}

        <Button size="lg" className="mt-5 w-full" onClick={onClose}>
          홈으로
        </Button>
      </SheetContent>
    </Sheet>
  );
}
