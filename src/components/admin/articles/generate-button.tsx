"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

/** 새 초안 하나를 워커에 맡긴다. 매일 한 편은 09:30 점검이 알아서 만든다. */
export function GenerateArticleButton() {
  const [state, setState] = useState<"idle" | "busy" | "queued" | "error">("idle");
  async function run() {
    setState("busy");
    try {
      const res = await fetch("/api/admin/articles/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      setState(res.ok ? "queued" : "error");
    } catch {
      setState("error");
    }
  }
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="sm" onClick={run} disabled={state === "busy"}>
        새 초안 만들기
      </Button>
      {state === "queued" && <span className="text-xs text-muted-foreground">워커에 맡겼어요. 몇 분 뒤 새로고침해 주세요.</span>}
      {state === "error" && <span className="text-xs text-destructive">맡기지 못했어요</span>}
    </div>
  );
}
