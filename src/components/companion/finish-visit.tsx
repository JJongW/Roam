"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { api } from "@/lib/api/client";
import { RecapSheet } from "@/components/route/recap-sheet";
import { useT } from "@/lib/i18n/provider";

/**
 * 관람 마치기 — 신호 기반 회고를 접고(POST /api/me/reflect) 회고 시트를 연다.
 * 동선 완료가 사라져(Phase A) 회고 트리거를 이 명시적 액션으로 대체. peak-end 해소.
 */
export function FinishVisit({ slug }: { slug: string }) {
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/api/me/reflect", { exhibitionSlug: slug });
    } catch {
      // 실패해도 최신 회고를 보여준다.
    } finally {
      setBusy(false);
      setOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={finish}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-muted-foreground active:opacity-70 disabled:opacity-50"
      >
        <Flag className="size-4" aria-hidden />
        {busy ? t("recap.finishing") : t("recap.finish")}
      </button>

      <RecapSheet
        open={open}
        onClose={() => {
          setOpen(false);
          router.push("/");
        }}
      />
    </>
  );
}
