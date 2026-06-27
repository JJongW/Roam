"use client";

import { useState } from "react";
import { Check, Star, NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { useAuthStore } from "@/lib/stores/auth";
import { Textarea } from "@/components/ui/textarea";
import { NotePhotos } from "@/components/booth/note-photos";

/**
 * Per-visitor controls for a booth: mark visited (4-a), save for later /
 * give up (4-b), and a personal memo (4-a). Works anonymously — records are
 * persisted locally (localStorage). Signing in only adds cross-device sync.
 */
export function BoothPersonalPanel({ boothId }: { boothId: string }) {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const openLogin = useAuthStore((s) => s.openLogin);

  const record = useVisitStore((s) => s.records[boothId]);
  const toggleStatus = useVisitStore((s) => s.toggleStatus);
  const setMemo = useVisitStore((s) => s.setMemo);

  const status = record?.status;
  const [memo, setLocalMemo] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Seed the editable memo from the cache, and re-seed when the booth changes
  // or the user signs in (which repopulates records). Done during render via
  // the "previous render value" pattern instead of an effect, so there's no
  // cascading-render setState-in-effect. https://react.dev/learn/you-might-not-need-an-effect
  const [syncKey, setSyncKey] = useState<string | null>(null);
  const curKey = `${boothId}:${user ? "in" : "out"}`;
  if (syncKey !== curKey) {
    setSyncKey(curKey);
    setLocalMemo(useVisitStore.getState().records[boothId]?.memo ?? "");
    setHydrated(true);
  }

  function onToggle(next: "visited" | "skipped") {
    toggleStatus(boothId, next);
    // Local store always holds it; sync to server only when signed in.
    if (user) void pushNote(boothId);
  }

  function onMemoBlur() {
    const prev = useVisitStore.getState().records[boothId]?.memo ?? "";
    if (memo.trim() === prev.trim()) return;
    setMemo(boothId, memo);
    if (user) void pushNote(boothId);
    toast.success(memo.trim() ? "메모를 저장했어요" : "메모를 지웠어요");
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-base font-bold">나의 기록</h2>

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
            <Star className="size-4.5" /> 관심
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

        <NotePhotos boothId={boothId} />

        {ready && !user && (
          <p className="text-xs text-muted-foreground">
            이 기기에 저장돼요.{" "}
            <button
              type="button"
              onClick={openLogin}
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              로그인
            </button>
            하면 다른 기기와 동기화돼요.
          </p>
        )}
      </>
    </section>
  );
}
