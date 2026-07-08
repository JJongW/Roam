"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { RoamMotion } from "@/components/companion/roam-motion";
import { RoamTyping } from "@/components/companion/roam-typing";
import { ChatBubble } from "@/components/companion/chat-bubble";
import { useAuthStore } from "@/lib/stores/auth";
import { VALUE_TAGS, valueLabel } from "@/lib/values";
import { Button } from "@/components/ui/button";

const FLAG = "roam-app-onboarded";

/** 대화 대본 — Roam이 순차로 건네는 발화. 각 단계는 목적/사용법을 함께 말한다. */
const STEPS = 3; // 소개 → 가치 → 마무리
type Phase = 0 | 1 | 2;

interface Bubble {
  id: string;
  from: "roam" | "you";
  text: string;
}

const INTRO: string[] = [
  "안녕, 나는 Roam이야 👋",
  "박람회엔 부스가 수백 개야. 그중에서 너한테 의미 있을 곳만 골라서 보여주는 게 내 일이야.",
  "몇 가지만 알려주면 그걸 기억해뒀다가 오늘도, 다음 박람회에서도 맞춰줄게. 30초면 돼.",
];
const VALUES_PROMPT =
  "먼저 — 박람회에서 뭘 채우고 싶어? 끌리는 걸 골라줘. 여러 개도 좋아.";

/**
 * 앱 최초진입 온보딩 — 폼이 아니라 Roam과의 대화. 상단 진행 표시로 단계를 알려주고,
 * 각 단계에서 "왜 묻는지·어떻게 쓰는지"를 함께 말한다. 고른 관람 가치를 브레인에 시드.
 * companion-reframe Phase C(대화형 재설계). 로그인 전엔 뜨지 않는다.
 */
export function AppOnboardingGate() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const [onboarded, setOnboarded] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem(FLAG),
  );

  const [phase, setPhase] = useState<Phase>(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [typing, setTyping] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const visible = !onboarded && ready && !!user;

  // 단계 진입 시 Roam 발화를 타이핑 딜레이와 함께 순차 공개.
  function revealSequential(texts: string[], after?: () => void) {
    setTyping(true);
    let acc = 500;
    texts.forEach((text, i) => {
      const t = setTimeout(() => {
        setBubbles((prev) => [
          ...prev,
          { id: `r-${Date.now()}-${i}`, from: "roam", text },
        ]);
        if (i === texts.length - 1) setTyping(false);
        else setTyping(true);
      }, acc);
      timers.current.push(t);
      acc += 700 + text.length * 12;
    });
    if (after) {
      const t = setTimeout(after, acc);
      timers.current.push(t);
    }
  }

  // 첫 공개 = 인트로. visible이 처음 true가 될 때 1회.
  const started = useRef(false);
  useEffect(() => {
    if (!visible || started.current) return;
    started.current = true;
    revealSequential(INTRO);
    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [visible]);

  // 새 발화마다 하단으로 스크롤.
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

  // 인트로 → 가치 질문.
  function goValues() {
    setBubbles((prev) => [
      ...prev,
      { id: "you-ok", from: "you", text: "좋아, 알려줄게" },
    ]);
    setPhase(1);
    revealSequential([VALUES_PROMPT]);
  }

  // 가치 제출 → 시드 → 마무리(사용법).
  async function submit() {
    if (picked.size === 0 || busy) return;
    const labels = [...picked].map(valueLabel);
    setBubbles((prev) => [
      ...prev,
      { id: "you-vals", from: "you", text: labels.join(" · ") },
    ]);
    setBusy(true);
    try {
      await api.post("/api/me/values", { values: [...picked] });
    } catch {
      // 실패해도 진행.
    } finally {
      setBusy(false);
      setPhase(2);
      revealSequential([
        `좋아, ${labels.slice(0, 2).join("·")} 쪽으로 맞춰서 골라뒀어.`,
        "이제 피드에서 내가 고른 곳부터 보면 돼. 마음에 들면 '끌림', 아니면 '별로'를 눌러줘 — 누를수록 더 정확해져.",
      ]);
    }
  }

  function finish() {
    if (typeof window !== "undefined") localStorage.setItem(FLAG, "1");
    setOnboarded(true);
    router.refresh();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background pt-safe pb-safe">
      {/* 진행 표시 */}
      <div className="flex items-center gap-3 px-6 pb-2 pt-4">
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
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
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        {bubbles.map((b) => (
          <ChatBubble key={b.id} from={b.from} text={b.text} />
        ))}
        {typing && <RoamTyping />}
      </div>

      {/* 액션 영역 — 단계별 */}
      <div className="border-t border-border px-5 pb-2 pt-4">
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
                  {v.label}
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
            좋아, 시작하자
          </Button>
        )}
        {phase === 1 && (
          <Button
            size="lg"
            className="w-full"
            onClick={submit}
            disabled={picked.size === 0 || busy || typing}
          >
            {busy ? "맞춰보는 중…" : "이걸로 시작"}
          </Button>
        )}
        {phase === 2 && (
          <Button
            size="lg"
            className="w-full"
            onClick={finish}
            disabled={typing}
          >
            박람회 보러 가기
          </Button>
        )}
      </div>
    </div>
  );
}
