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
import { useT } from "@/lib/i18n/provider";
import {
  closingLine,
  type ReflectQuestion,
} from "@/lib/memory/reflect-questions";
import { valueLabel } from "@/lib/values";
import { themeLabel } from "@/lib/booth/themes";
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
  const t = useT();
  const [visit, setVisit] = useState<VisitDigest | null>(null);
  const [question, setQuestion] = useState<ReflectQuestion | null>(null);
  const [answered, setAnswered] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // loading 기본 true — 시트는 관람당 1회 열리므로 동기 리셋 불필요(cascading render 회피).
    api
      .get<{ data: { visit: VisitDigest | null; question: ReflectQuestion | null } }>(
        "/api/me/recap",
      )
      .then((r) => {
        if (cancelled) return;
        setVisit(r.data.visit);
        setQuestion(r.data.question);
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

  // 답은 브레인 preferences로 간다 — 클릭으로는 알 수 없는 축이라 여기서만 채워진다.
  // 실패해도 대화는 계속된다(회고를 막지 않는다).
  function answer(opt: { label: string; value: string | number }) {
    if (!question || answered) return;
    setAnswered(opt.label);
    void api
      .post("/api/me/reflect/answer", { key: question.key, value: opt.value })
      .catch(() => {});
  }

  // themesEngaged는 slug — 사람 말로 바꿔서 넘긴다(가치 slug 우선, 테마 대분류도 커버).
  const themeLabels = (visit?.themesEngaged ?? []).map(
    (slug) => valueLabel(slug) || themeLabel(slug) || slug,
  );
  const closing = closingLine(themeLabels, question, answered ?? undefined);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="px-5 pb-8">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
              <RoamMotion src="/walk_think.webm" />
            </span>
            {t("recap.title")}
          </SheetTitle>
          <SheetDescription>{t("recap.desc")}</SheetDescription>
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
              {text ?? t("recap.fallback")}
            </p>
          )}
        </div>

        {!loading && visit && visit.boothsVisited.length > 0 && (
          <div className="mt-3 flex items-center gap-1.5 px-1 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden />
            {t("recap.visited", { n: visit.boothsVisited.length })}
          </div>
        )}

        {/* A(서사) 위에 오늘 남긴 가치 — 목표 대비 무엇을 봤나. */}
        {!loading && visit && visit.themesEngaged.length > 0 && (
          <div className="mt-3 px-1">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
              {t("recap.engaged")}
            </p>
            <ValueChips
              tags={visit.themesEngaged.map((slug) => ({ slug, strength: 1 }))}
              max={5}
            />
          </div>
        )}

        {/* C(다음으로 잇기) — 관찰만 하고 끝내지 않는다. 클릭으로 알 수 없는 걸
            하나 물어 다음 전시를 더 잘 고르게 한다. 다 답했으면 질문은 없다. */}
        {!loading && visit && question && !answered && (
          <div className="mt-4 space-y-2 rounded-xl border border-primary/25 bg-accent/30 p-3">
            <p className="text-sm font-semibold leading-relaxed">
              {question.prompt}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {question.options.map((o) => (
                <button
                  key={String(o.value)}
                  type="button"
                  onClick={() => answer(o)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium active:opacity-70"
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 마무리 — "잘 봤다"가 아니라 "다음엔 이렇게 해줄게"여야 관람이 닫힌다. */}
        {!loading && visit && (
          <p className="mt-4 rounded-xl border border-border bg-card p-3 text-sm leading-relaxed text-muted-foreground">
            {closing ?? t("recap.next")}
          </p>
        )}

        <Button size="lg" className="mt-5 w-full" onClick={onClose}>
          {t("recap.home")}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
