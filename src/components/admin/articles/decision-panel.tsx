"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Action = "approve" | "reject";

/**
 * 승인, 반려 버튼. 슬랙 서명 링크로 왔으면(`intent`) 그 결정을 크게 보여 주고 한 번 눌러 확정한다.
 * 링크를 여는 것만으로는 아무것도 바뀌지 않는다 — 바꾸는 건 이 버튼의 POST다.
 */
export function DecisionPanel({
  id,
  intent,
  linkProblem,
}: {
  id: string;
  intent: Action | null;
  /** 링크가 만료됐거나 서명이 맞지 않을 때 한 줄. */
  linkProblem: string | null;
}) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState("");

  async function decide(action: Action) {
    if (busy) return;
    setBusy(action);
    setError("");
    try {
      const res = await fetch(`/api/admin/articles/${encodeURIComponent(id)}/decision`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action === "reject" && reason.trim() ? { action, reason: reason.trim() } : { action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? "저장하지 못했어요");
      // 쿼리(서명 링크)를 걷어 낸 주소로 — 새로고침해도 확인 화면이 다시 뜨지 않게.
      router.replace(`/admin/articles/${encodeURIComponent(id)}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      {intent && (
        <p className="text-sm font-semibold">
          슬랙에서 {intent === "approve" ? "승인을" : "반려를"} 눌러 오셨어요. 아래 버튼을 한 번 더 누르면 확정돼요.
        </p>
      )}
      {linkProblem && <p className="text-sm text-muted-foreground">{linkProblem}</p>}
      {(intent === "reject" || intent === null) && (
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          placeholder="반려 이유(선택). 반려한 주제는 다음 초안에서 빠져요."
          aria-label="반려 이유"
        />
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => decide("approve")} disabled={!!busy} variant={intent === "reject" ? "outline" : "default"}>
          {busy === "approve" ? "저장 중이에요" : "승인"}
        </Button>
        <Button onClick={() => decide("reject")} disabled={!!busy} variant={intent === "reject" ? "destructive" : "outline"}>
          {busy === "reject" ? "저장 중이에요" : "반려"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">승인하면 공개 API(/api/articles)에 나가요. 결정은 한 번만 할 수 있어요.</p>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
