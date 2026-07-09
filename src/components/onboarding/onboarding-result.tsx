"use client";

import { useEffect, useState } from "react";
import { Award } from "lucide-react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";
import { valueDef } from "@/lib/values";
import { ValueMindMap } from "@/components/me/value-mindmap";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { UserBrain } from "@/lib/types";

/**
 * 온보딩 완료 결과 — ingan "검사 완료" 톤. 방금 시드한 관람 가치 프로필을 마인드맵으로
 * 보여준다(잠금/해금 게임화 없음). 닫으면 피드(부스 추천)로. GET /api/me/brain로 프로필 로드.
 */
export function OnboardingResult({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [brain, setBrain] = useState<UserBrain | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get<{ data: UserBrain }>("/api/me/brain")
      .then((r) => !cancelled && setBrain(r.data))
      .catch(() => !cancelled && setBrain(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  const nodes = (brain?.interests ?? [])
    .filter((n) => valueDef(n.key))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="px-5 pb-8">
        <SheetHeader className="items-center text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Award className="size-7" aria-hidden />
          </span>
          <SheetTitle className="text-xl">{t("onboardingQ.resultTitle")}</SheetTitle>
          <SheetDescription>{t("onboardingQ.resultDesc")}</SheetDescription>
        </SheetHeader>

        <div className="mt-2 rounded-2xl border border-border bg-card p-4">
          <p className="text-center text-sm font-bold">
            {t("onboardingQ.profileTitle")}
          </p>
          {loading ? (
            <div className="mx-auto mt-4 size-64 animate-pulse rounded-full bg-secondary" />
          ) : nodes.length > 0 ? (
            <ValueMindMap nodes={nodes} label={(s) => t(`values.${s}`)} />
          ) : (
            <p className="mt-6 text-center text-sm text-muted-foreground">
              {t("onboardingQ.profileEmpty")}
            </p>
          )}
        </div>

        <Button size="lg" className="mt-5 w-full" onClick={onClose}>
          {t("onboardingQ.resultCta")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
