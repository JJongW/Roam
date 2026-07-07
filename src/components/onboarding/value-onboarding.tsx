"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Compass, Sparkles } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { VALUE_TAGS, valueLabel } from "@/lib/values";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type Step = "intro" | "orientation" | "pick" | "done";

/**
 * 관람 가치 온보딩 — Roam 첫인사 → 오리엔테이션(전시 큰 개념) → "무엇을 남기고 싶은가"(가치 선택)
 * → 결과 문장. 동선 최적화가 아니라 의미를 먼저 묻는 진입(companion-reframe §7.1·§7.2).
 */
export function ValueOnboarding({
  slug,
  exhibitionName,
  description,
  hallCount,
  categoryNames,
}: {
  slug: string;
  exhibitionName: string;
  description: string;
  hallCount: number;
  categoryNames: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("intro");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function start() {
    setStep("intro");
    setPicked(new Set());
    setOpen(true);
  }
  function toggle(v: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }
  async function submit() {
    if (picked.size === 0 || busy) return;
    setBusy(true);
    try {
      await api.post("/api/me/values", { exhibitionSlug: slug, values: [...picked] });
    } catch {
      // 실패해도 진행.
    } finally {
      setBusy(false);
      setStep("done");
    }
  }
  function finish() {
    setOpen(false);
    router.refresh();
  }

  const themes = categoryNames.slice(0, 5).join(" · ");
  const result = `이번 관람은 "많이 보기"보다 ${[...picked]
    .slice(0, 2)
    .map(valueLabel)
    .join("·")} 쪽으로 골라올게요. 맞춰서 발견을 도와줄게요.`;

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-accent/40 p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
      >
        <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold">무엇을 남기고 싶으세요?</p>
          <p className="text-sm text-muted-foreground">
            Roam과 오늘 관람의 관심 가치를 먼저 정해요
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-5 pb-8">
          {step === "intro" && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" aria-hidden />
                  안녕, 나는 Roam이야
                </SheetTitle>
                <SheetDescription>
                  오늘 많은 걸 다 보게 하기보다, 너한테 의미 있을 순간을 놓치지
                  않게 같이 볼게.
                </SheetDescription>
              </SheetHeader>
              <Button size="lg" className="mt-6 w-full" onClick={() => setStep("orientation")}>
                좋아, 시작하자
              </Button>
            </>
          )}

          {step === "orientation" && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Compass className="size-5 text-primary" aria-hidden />
                  {exhibitionName}, 먼저 큰 그림부터
                </SheetTitle>
              </SheetHeader>
              <div className="mt-3 rounded-2xl border border-border bg-card p-4 text-sm leading-relaxed text-foreground/90">
                <p>{description}</p>
                <p className="mt-2 text-muted-foreground">
                  홀 {hallCount}개 · 테마: {themes}
                </p>
              </div>
              <p className="mt-3 px-1 text-sm text-muted-foreground">
                이 안에서 오늘 무엇을 남기고 싶은지 같이 골라볼까?
              </p>
              <Button size="lg" className="mt-4 w-full" onClick={() => setStep("pick")}>
                관심 가치 고르기
              </Button>
            </>
          )}

          {step === "pick" && (
            <>
              <SheetHeader>
                <SheetTitle>무엇을 남기고 싶으세요?</SheetTitle>
                <SheetDescription>
                  이번 박람회에서 챙기고 싶은 걸 골라줘. 여러 개도 좋아.
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 flex flex-wrap gap-2">
                {VALUE_TAGS.map((v) => {
                  const on = picked.has(v.slug);
                  return (
                    <button
                      key={v.slug}
                      type="button"
                      onClick={() => toggle(v.slug)}
                      aria-pressed={on}
                      className={cn(
                        "rounded-full border px-3.5 py-2 text-sm font-semibold active:opacity-70",
                        on ? "border-transparent text-white" : "border-border bg-card text-foreground",
                      )}
                      style={on ? { backgroundColor: v.color } : undefined}
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
              <Button
                size="lg"
                className="mt-5 w-full"
                onClick={submit}
                disabled={picked.size === 0 || busy}
              >
                {busy ? "정하는 중…" : "정했어요"}
              </Button>
            </>
          )}

          {step === "done" && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" aria-hidden />
                  좋아, 이렇게 볼게
                </SheetTitle>
              </SheetHeader>
              <p className="mt-4 rounded-2xl border border-primary/25 bg-accent/40 p-4 text-[15px] font-medium leading-relaxed text-foreground/90">
                {result}
              </p>
              <Button size="lg" className="mt-5 w-full" onClick={finish}>
                둘러보기
              </Button>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
