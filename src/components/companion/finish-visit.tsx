"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { api } from "@/lib/api/client";
import { RecapSheet } from "@/components/route/recap-sheet";
import { VisitedRetroPrompt } from "@/components/companion/visited-retro-prompt";
import { useT } from "@/lib/i18n/provider";
import { useCompanionStore } from "@/lib/stores/companion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * 관람 마치기 — 답 안 한 '가봄' 되묻기가 있으면 먼저 묻고(VisitedRetroPrompt),
 * 그 다음 신호 기반 회고를 접어(POST /api/me/reflect) 회고 시트를 연다.
 * 동선 완료가 사라져(Phase A) 회고 트리거를 이 명시적 액션으로 대체. peak-end 해소.
 */
export function FinishVisit({
  slug,
  initialJudgedCount,
}: {
  slug: string;
  initialJudgedCount: number;
}) {
  const t = useT();
  const router = useRouter();
  const [retroOpen, setRetroOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // VisitedRetroPrompt가 대상 0개일 때 onDone(=finishReflect)을 effect에서 호출한다.
  // finishReflect가 매 렌더 새 함수면 그 effect의 [pending, onDone] 의존성이 매번
  // 바뀌어 재실행되고(특히 busy 토글·시트 닫힘 애니메이션 도중) reflect가 수십~수백
  // 번 중복 호출된다(수동 검증 중 실측 385회). ref 기반 가드 + useCallback으로
  // 참조를 고정해 정확히 한 번만 불리게 한다.
  const busyRef = useRef(false);

  // 서버 렌더 시점 값 + 그 뒤 클라이언트에서 반응한 게 있으면(전체 새로고침 없이도
  // companion store가 실시간으로 갖고 있다) 둘 중 하나만 있어도 판단이 있었던 거다.
  const tasteJudged = useCompanionStore((s) => s.tasteJudged);
  const hasJudged = initialJudgedCount > 0 || tasteJudged > 0;

  const finishReflect = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await api.post("/api/me/reflect", { exhibitionSlug: slug });
    } catch {
      // 실패해도 최신 회고를 보여준다.
    } finally {
      busyRef.current = false;
      setBusy(false);
      setRetroOpen(false);
      setOpen(true);
    }
  }, [slug]);

  if (!hasJudged) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setRetroOpen(true)}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-muted-foreground active:opacity-70 disabled:opacity-50"
      >
        <Flag className="size-4" aria-hidden />
        {busy ? t("recap.finishing") : t("recap.finish")}
      </button>

      <Sheet open={retroOpen} onOpenChange={setRetroOpen}>
        <SheetContent side="bottom" className="px-5 pb-8">
          <SheetHeader>
            <SheetTitle>{t("recap.finish")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <VisitedRetroPrompt exhibitionSlug={slug} onDone={finishReflect} />
          </div>
        </SheetContent>
      </Sheet>

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
