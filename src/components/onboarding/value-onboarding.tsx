"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { VALUE_TAGS } from "@/lib/values";
import { useT } from "@/lib/i18n/provider";
import { RoamMotion } from "@/components/companion/roam-motion";
import { RoamTyping } from "@/components/companion/roam-typing";
import { ChatBubble } from "@/components/companion/chat-bubble";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const STEPS = 3; // 인사·오리엔테이션 → 가치 → 마무리
type Phase = 0 | 1 | 2;
interface Bubble {
  id: string;
  from: "roam" | "you";
  text: string;
}

/**
 * 전시별 관람 가치 온보딩 — 앱 최초진입 온보딩과 같은 대화형. 전시에 처음 들어온 순간
 * Roam이 큰 그림을 설명하고(오리엔테이션) "무엇을 남길지"를 함께 정한다. 진행 표시 +
 * 목적·사용법 안내. companion-reframe §7.1·§7.2, Phase C 대화형 통일.
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
  const t = useT();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const themes = categoryNames.slice(0, 4).join(" · ");
  const INTRO = [
    t("valueOnboarding.intro1", { name: exhibitionName }),
    description,
    t("valueOnboarding.intro3", { halls: hallCount, themes }),
  ];

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function revealSequential(texts: string[]) {
    setTyping(true);
    let acc = 400;
    texts.forEach((text, i) => {
      const t = setTimeout(() => {
        setBubbles((prev) => [
          ...prev,
          { id: `r-${Date.now()}-${i}`, from: "roam", text },
        ]);
        setTyping(i !== texts.length - 1);
      }, acc);
      timers.current.push(t);
      acc += 600 + text.length * 11;
    });
  }

  function start() {
    clearTimers();
    setPhase(0);
    setPicked(new Set());
    setBubbles([]);
    setTyping(false);
    setOpen(true);
    revealSequential(INTRO);
  }

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [bubbles, typing]);

  function toggle(v: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  function goValues() {
    setBubbles((prev) => [
      ...prev,
      { id: "you-ok", from: "you", text: t("valueOnboarding.youOk") },
    ]);
    setPhase(1);
    revealSequential([t("valueOnboarding.valuePrompt")]);
  }

  async function submit() {
    if (picked.size === 0 || busy) return;
    const labels = [...picked].map((s) => t(`values.${s}`));
    setBubbles((prev) => [
      ...prev,
      { id: "you-vals", from: "you", text: labels.join(" · ") },
    ]);
    setBusy(true);
    try {
      await api.post("/api/me/values", {
        exhibitionSlug: slug,
        values: [...picked],
      });
    } catch {
      // 실패해도 진행.
    } finally {
      setBusy(false);
      setPhase(2);
      revealSequential([
        t("valueOnboarding.doneResult", {
          values: labels.slice(0, 2).join("·"),
        }),
        t("valueOnboarding.doneHow"),
      ]);
    }
  }

  function finish() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-accent/40 p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
      >
        <span className="flex size-11 items-center justify-center overflow-hidden rounded-xl ring-1 ring-border">
          <RoamMotion src="/head.mp4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t("valueOnboarding.cardTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("valueOnboarding.cardSub")}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex max-h-[85vh] flex-col gap-0 px-0 pb-0"
        >
          <SheetTitle className="sr-only">
            {t("valueOnboarding.cardTitle")}
          </SheetTitle>
          {/* 진행 표시 */}
          <div className="flex items-center gap-3 px-5 pb-3 pt-5">
            <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
              <RoamMotion src="/walking.mp4" />
            </span>
            <div className="flex flex-1 gap-1.5">
              {Array.from({ length: STEPS }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i <= phase ? "bg-primary" : "bg-secondary",
                  )}
                />
              ))}
            </div>
            <span className="text-xs font-semibold tabular-nums text-muted-foreground">
              {phase + 1}/{STEPS}
            </span>
          </div>

          {/* 대화 스레드 */}
          <div
            ref={scrollRef}
            className="min-h-[220px] flex-1 space-y-3 overflow-y-auto px-5 py-3"
          >
            {bubbles.map((b) => (
              <ChatBubble key={b.id} from={b.from} text={b.text} />
            ))}
            {typing && <RoamTyping />}
          </div>

          {/* 액션 영역 */}
          <div className="border-t border-border px-5 pb-8 pt-4">
            {phase === 1 && (
              <div className="mb-3 flex flex-wrap gap-2">
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
                        on
                          ? "border-transparent text-white"
                          : "border-border bg-card text-foreground",
                      )}
                      style={on ? { backgroundColor: v.color } : undefined}
                    >
                      {t(`values.${v.slug}`)}
                    </button>
                  );
                })}
              </div>
            )}

            {phase === 0 && (
              <Button
                size="lg"
                className="w-full"
                onClick={goValues}
                disabled={typing}
              >
                {t("valueOnboarding.startCta")}
              </Button>
            )}
            {phase === 1 && (
              <Button
                size="lg"
                className="w-full"
                onClick={submit}
                disabled={picked.size === 0 || busy || typing}
              >
                {busy
                  ? t("appOnboarding.matching")
                  : t("valueOnboarding.doneCta")}
              </Button>
            )}
            {phase === 2 && (
              <Button
                size="lg"
                className="w-full"
                onClick={finish}
                disabled={typing}
              >
                {t("valueOnboarding.browse")}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
