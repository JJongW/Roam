"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/stores/auth";
import { VALUE_TAGS, valueLabel } from "@/lib/values";
import { Button } from "@/components/ui/button";

const FLAG = "roam-app-onboarded";
type Step = "intro" | "values" | "done";

/**
 * 앱 최초진입 온보딩 — Roam 첫인사 → 관람 가치 프로필(무엇을 채우고 싶은지) → 브레인 시드.
 * 전시 선택 전, 앱 레벨에서 1회. 이후 전시별 온보딩(가치 온보딩)과 피드가 이 프로필을 이어받는다.
 * companion-reframe MVP 1·2화면.
 */
export function AppOnboardingGate() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  // localStorage는 동기라 초기값으로 안전히 읽음(서버=false → 게이트 null → 하이드레이션 일치).
  const [onboarded, setOnboarded] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem(FLAG),
  );
  const [step, setStep] = useState<Step>("intro");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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
      await api.post("/api/me/values", { values: [...picked] });
    } catch {
      // 실패해도 진행.
    } finally {
      setBusy(false);
      setStep("done");
    }
  }

  function finish() {
    if (typeof window !== "undefined") localStorage.setItem(FLAG, "1");
    setOnboarded(true);
    router.refresh();
  }

  if (onboarded || !ready || !user) return null;

  const result = `좋아, ${[...picked]
    .slice(0, 2)
    .map(valueLabel)
    .join("·")} 쪽으로 맞춰서 박람회를 골라줄게.`;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background p-6 pt-safe pb-safe">
      {step === "intro" && (
        <div className="flex flex-1 flex-col justify-center gap-4">
          <span className="flex size-14 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-border">
            <Image
              src="/logo.svg"
              alt="Roam"
              width={56}
              height={56}
              className="size-full object-cover"
              priority
            />
          </span>
          <h1 className="text-2xl font-extrabold leading-tight">
            안녕, 나는 Roam이야
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            박람회에서 많은 걸 다 보게 하기보다, 너한테 의미 있을 순간을 놓치지
            않게 같이 볼게. 시작하기 전에 너를 조금만 알려줘.
          </p>
          <Button
            size="lg"
            className="mt-2 w-full"
            onClick={() => setStep("values")}
          >
            좋아, 시작하자
          </Button>
        </div>
      )}

      {step === "values" && (
        <div className="flex flex-1 flex-col">
          <div className="mt-4">
            <h1 className="text-xl font-extrabold">
              박람회에서 뭘 채우고 싶어?
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              끌리는 걸 골라줘. 여러 개도 좋아.
            </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
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
          <div className="mt-auto pt-6">
            <Button
              size="lg"
              className="w-full"
              onClick={submit}
              disabled={picked.size === 0 || busy}
            >
              {busy ? "맞춰보는 중…" : "이걸로 시작"}
            </Button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="flex flex-1 flex-col justify-center gap-4">
          <span className="flex size-14 items-center justify-center overflow-hidden rounded-2xl ring-1 ring-border">
            <Image
              src="/logo.svg"
              alt="Roam"
              width={56}
              height={56}
              className="size-full object-cover"
            />
          </span>
          <h1 className="text-2xl font-extrabold leading-tight">
            이런 스타일이네
          </h1>
          <p className="text-[15px] leading-relaxed text-foreground/90">
            {result}
          </p>
          <Button size="lg" className="mt-2 w-full" onClick={finish}>
            박람회 보러 가기
          </Button>
        </div>
      )}
    </div>
  );
}
