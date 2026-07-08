"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { RoamMotion } from "@/components/companion/roam-motion";
import { useAuthStore } from "@/lib/stores/auth";
import { VALUE_TAGS, valueLabel } from "@/lib/values";
import { Button } from "@/components/ui/button";

const FLAG = "roam-app-onboarded";

// 슬라이드 순서: 인트로 3장(누구/왜/어떻게) → 가치 선택 → 마무리. 도트로 진행 표시.
const INTRO = [
  {
    title: ["안녕, 나는", "Roam이야"],
    sub: "박람회에서 너한테 의미 있을 부스만 골라주는 관람 동행자야.",
  },
  {
    title: ["많이 보기보다", "의미 있게"],
    sub: "수백 개 부스를 다 도는 게 아니라, 네 취향에 맞는 곳부터 같이 둘러봐.",
  },
  {
    title: ["볼수록", "더 잘 맞춰줘"],
    sub: "끌림·별로만 눌러줘. 네 반응을 기억해서 다음엔 더 정확해져.",
  },
];
const STEPS = INTRO.length + 2; // + 가치 + 마무리
const VALUE_STEP = INTRO.length;
const DONE_STEP = INTRO.length + 1;

/**
 * 앱 최초진입 온보딩 — 큰 Roam 마스코트 히어로 + 도트 인디케이터 + '다음' 슬라이드 캐러셀.
 * 인트로 3장으로 누구/왜/어떻게(사용법)를 그림 중심으로 소개하고, 관람 가치를 골라 브레인에
 * 시드한다. 폼이 아니라 캐릭터가 이끄는 첫인상. companion-reframe Phase C(이미지형 재설계).
 */
export function AppOnboardingGate() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const [onboarded, setOnboarded] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem(FLAG),
  );
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const touchX = useRef<number | null>(null);

  const visible = !onboarded && ready && !!user;
  if (!visible) return null;

  function toggle(v: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }

  async function next() {
    if (busy) return;
    if (step < VALUE_STEP) {
      setStep(step + 1);
      return;
    }
    if (step === VALUE_STEP) {
      if (picked.size === 0) return;
      setBusy(true);
      try {
        await api.post("/api/me/values", { values: [...picked] });
      } catch {
        // 실패해도 진행.
      } finally {
        setBusy(false);
        setStep(DONE_STEP);
      }
      return;
    }
    // DONE
    if (typeof window !== "undefined") localStorage.setItem(FLAG, "1");
    setOnboarded(true);
    router.refresh();
  }

  function back() {
    if (step > 0 && step <= VALUE_STEP) setStep(step - 1);
  }

  // 간단한 스와이프 — 인트로 구간에서만 좌우 이동.
  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.touches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) < 50) return;
    if (dx < 0 && step < VALUE_STEP) setStep(step + 1);
    else if (dx > 0) back();
  }

  const result =
    picked.size > 0
      ? `${[...picked].slice(0, 2).map(valueLabel).join("·")} 쪽으로 맞춰서 골라줄게.`
      : "";

  const cta =
    step === VALUE_STEP
      ? busy
        ? "맞춰보는 중…"
        : "이걸로 시작"
      : step === DONE_STEP
        ? "박람회 보러 가기"
        : "다음";
  const ctaDisabled =
    busy || (step === VALUE_STEP && picked.size === 0);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-background px-6 pb-8 pt-safe"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* 히어로 + 본문 */}
      <div
        key={step}
        className="animate-in fade-in slide-in-from-right-2 flex flex-1 flex-col items-center justify-center gap-6 text-center duration-300"
      >
        {step !== VALUE_STEP && (
          <span className="flex size-44 items-center justify-center overflow-hidden rounded-[2.5rem]">
            <RoamMotion src={step === DONE_STEP ? "/head.mp4" : "/walking.mp4"} />
          </span>
        )}

        {step < VALUE_STEP && (
          <>
            <h1 className="text-[26px] font-extrabold leading-snug">
              {INTRO[step].title[0]}
              <br />
              {INTRO[step].title[1]}
            </h1>
            <p className="max-w-[19rem] text-[15px] leading-relaxed text-muted-foreground">
              {INTRO[step].sub}
            </p>
          </>
        )}

        {step === VALUE_STEP && (
          <div className="w-full">
            <h1 className="text-[22px] font-extrabold leading-snug">
              박람회에서
              <br />뭘 채우고 싶어?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              끌리는 걸 골라줘. 여러 개도 좋아.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {VALUE_TAGS.map((v) => {
                const on = picked.has(v.slug);
                return (
                  <button
                    key={v.slug}
                    type="button"
                    onClick={() => toggle(v.slug)}
                    aria-pressed={on}
                    className={cn(
                      "rounded-full border px-4 py-2.5 text-sm font-semibold active:opacity-70",
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
          </div>
        )}

        {step === DONE_STEP && (
          <>
            <h1 className="text-[26px] font-extrabold leading-snug">
              이런 스타일이네
            </h1>
            <p className="max-w-[19rem] text-[15px] leading-relaxed text-foreground/90">
              {result}
            </p>
          </>
        )}
      </div>

      {/* 도트 인디케이터 */}
      <div className="flex justify-center gap-2 pb-6">
        {Array.from({ length: STEPS }).map((_, i) => (
          <span
            key={i}
            className={cn(
              "h-2 rounded-full transition-all",
              i === step ? "w-5 bg-primary" : "w-2 bg-secondary",
            )}
          />
        ))}
      </div>

      <Button size="lg" className="w-full" onClick={next} disabled={ctaDisabled}>
        {cta}
      </Button>
    </div>
  );
}
