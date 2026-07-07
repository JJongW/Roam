"use client";

import { useState } from "react";
import { Check, Clock3, Heart, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { SignalKind } from "@/lib/types";

/**
 * 부스 반응 버튼(끌림/나중에/별로/이미봄). 스스로 갈지 말지 판단한 결과를 신호로 남겨
 * 브레인에 피드백한다. companion-reframe §7.5 — 명령이 아니라 사용자의 반응을 받는다.
 */
const REACTIONS: {
  key: string;
  label: string;
  kind: SignalKind;
  Icon: typeof Heart;
}[] = [
  { key: "interested", label: "끌림", kind: "reaction_interested", Icon: Heart },
  { key: "later", label: "나중에", kind: "reaction_later", Icon: Clock3 },
  { key: "skip", label: "별로", kind: "booth_skipped", Icon: X },
  { key: "seen", label: "이미 봄", kind: "booth_visited", Icon: Check },
];

export function ReactionBar({ boothId }: { boothId: string }) {
  const [picked, setPicked] = useState<string | null>(null);

  function react(r: (typeof REACTIONS)[number]) {
    setPicked(r.key);
    void api.post("/api/me/signal", { boothId, kind: r.kind }).catch(() => {});
  }

  return (
    <div className="flex gap-1.5">
      {REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => react(r)}
          aria-pressed={picked === r.key}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold active:opacity-70",
            picked === r.key
              ? "border-primary bg-accent/60 text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          <r.Icon className="size-3.5" aria-hidden />
          {r.label}
        </button>
      ))}
    </div>
  );
}
