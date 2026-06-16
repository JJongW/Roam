"use client";

import { useEffect, useState } from "react";
import { Check, Clock3, NotebookPen, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { useAuthStore } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Per-visitor controls for a booth: mark visited (4-a), save for later /
 * give up (4-b), and a personal memo (4-a). Requires sign-in; persisted to
 * the server per user and cached locally.
 */
export function BoothPersonalPanel({ boothId }: { boothId: string }) {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const openLogin = useAuthStore((s) => s.openLogin);

  const record = useVisitStore((s) => s.records[boothId]);
  const toggleStatus = useVisitStore((s) => s.toggleStatus);
  const setMemo = useVisitStore((s) => s.setMemo);

  const status = user ? record?.status : undefined;
  const [memo, setLocalMemo] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Sync local memo from the cache once the store is ready.
  useEffect(() => {
    setLocalMemo(useVisitStore.getState().records[boothId]?.memo ?? "");
    setHydrated(true);
  }, [boothId, user]);

  function onToggle(next: "visited" | "skipped") {
    toggleStatus(boothId, next);
    void pushNote(boothId);
  }

  function onMemoBlur() {
    setMemo(boothId, memo);
    void pushNote(boothId);
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-base font-bold">나의 기록</h2>

      {ready && !user ? (
        <button
          type="button"
          onClick={openLogin}
          className="flex w-full items-center gap-3 rounded-xl border border-dashed border-border bg-card p-4 text-left active:scale-[0.99]"
        >
          <div className="flex size-10 items-center justify-center rounded-xl bg-primary/12">
            <UserRound className="size-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold">로그인하고 기록하기</p>
            <p className="text-xs text-muted-foreground">
              방문 체크·메모는 로그인 후 저장돼요
            </p>
          </div>
        </button>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={status === "visited"}
              onClick={() => onToggle("visited")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border py-3 text-sm font-bold transition-colors",
                status === "visited"
                  ? "border-success bg-success/12 text-success"
                  : "border-border bg-card text-foreground",
              )}
            >
              <Check className="size-4.5" /> 방문함
            </button>
            <button
              type="button"
              aria-pressed={status === "skipped"}
              onClick={() => onToggle("skipped")}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-xl border py-3 text-sm font-bold transition-colors",
                status === "skipped"
                  ? "border-warning bg-warning/12 text-[#9a6700]"
                  : "border-border bg-card text-foreground",
              )}
            >
              <Clock3 className="size-4.5" /> 이따 다시
            </button>
          </div>

          <div className="relative">
            <NotebookPen className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
            <Textarea
              value={memo}
              disabled={!hydrated}
              onChange={(e) => setLocalMemo(e.target.value)}
              onBlur={onMemoBlur}
              placeholder="이 부스에 대한 메모를 남겨보세요 (예: 리필 노트 사기, 친구 선물)"
              rows={2}
              maxLength={300}
              className="resize-none pl-9"
              aria-label="부스 메모"
            />
          </div>
        </>
      )}
    </section>
  );
}
