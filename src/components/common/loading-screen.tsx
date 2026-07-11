"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n/provider";

type Topic = "exhibition" | "map" | "booth";

/**
 * 화면별 로딩 상태 — 스켈레톤만 보이면 현장에서 "멈췄다"로 읽힌다. 그래서 항상
 * 무엇을 불러오는지 한 줄로 말해준다(로미 톤). ~4초 넘게 걸리면 안심용 문구 추가.
 * loading.tsx(서버)가 이걸 렌더한다.
 */
export function LoadingScreen({ topic }: { topic: Topic }) {
  const t = useT();
  const [longWait, setLongWait] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setLongWait(true), 4000);
    return () => clearTimeout(id);
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2.5 px-5 pt-6 text-sm font-semibold text-foreground">
        <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
        <span>{t(`loading.${topic}`)}</span>
      </div>
      {longWait && (
        <p className="px-5 pt-1.5 text-xs text-muted-foreground animate-in fade-in">
          {t("loading.longWait")}
        </p>
      )}
      {topic === "booth" ? <BoothSkeleton /> : <FeedSkeleton />}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-4 w-2/3" />
      <div className="space-y-3 pt-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

function BoothSkeleton() {
  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-20 w-full rounded-2xl" />
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  );
}
