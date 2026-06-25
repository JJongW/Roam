"use client";

// ---------------------------------------------------------------------------
// AI Companion 온보딩 — 프레젠테이션 파츠.
// 차분·미니멀·신뢰감. 이모지/로봇 아이콘 없음. 큰 터치 타깃.
// ---------------------------------------------------------------------------

import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OnboardingOption,
  UnderstandingItem,
} from "@/lib/onboarding/onboarding-types";

/** AI 동반자의 한 마디. 줄바꿈(\n)을 문단으로 렌더. */
export function OnboardingMessage({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="space-y-1.5"
    >
      {text.split("\n").map((line, i) => (
        <p key={i} className="text-[15px] leading-relaxed text-foreground/90">
          {line}
        </p>
      ))}
    </motion.div>
  );
}

/** 사용자가 고른 답 — 대화 기록에 조용히 남는 칩. */
export function OnboardingEcho({ label }: { label: string }) {
  return (
    <div className="flex justify-end">
      <span className="rounded-2xl rounded-tr-sm bg-secondary px-3 py-1.5 text-sm font-medium text-foreground/80">
        {label}
      </span>
    </div>
  );
}

/** 큰 선택지 버튼. 단일/다중 공용. */
export function OnboardingOptionButton({
  option,
  selected,
  onClick,
}: {
  option: OnboardingOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors active:scale-[0.99]",
        selected
          ? "border-primary bg-accent/40"
          : "border-border bg-card hover:bg-secondary/50",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{option.label}</span>
        {option.hint && (
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {option.hint}
          </span>
        )}
      </span>
      {selected && <Check className="size-5 shrink-0 text-primary" />}
    </button>
  );
}

/** 진행 표시 — 얇고 조용한 바. */
export function OnboardingProgress({ value }: { value: number }) {
  return (
    <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
      <motion.div
        className="h-full rounded-full bg-primary"
        initial={false}
        animate={{ width: `${Math.round(value * 100)}%` }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
    </div>
  );
}

/** "내가 이해한 내용" 패널. 데스크탑 우측 / 모바일 접이식 카드. */
export function UnderstandingPanel({
  items,
  className,
}: {
  items: UnderstandingItem[];
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card p-4", className)}>
      <p className="mb-3 text-sm font-bold text-muted-foreground">
        내가 이해한 내용
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground/70">
          대화를 나누면서 너를 알아갈게.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <motion.li
              key={it.key}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-baseline justify-between gap-3 text-sm"
            >
              <span className="shrink-0 text-muted-foreground">{it.key}</span>
              <span className="text-right font-semibold">{it.value}</span>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 추천 동선 프리뷰 카드 — 이름·이유·시간·부스 수. */
export function RoutePreviewCard({
  name,
  reason,
  estimatedMinutes,
  boothCount,
}: {
  name: string;
  reason: string;
  estimatedMinutes?: number;
  boothCount?: number;
}) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-accent/30 p-4">
      <p className="text-lg font-extrabold leading-snug">{name}</p>
      {reason && (
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
          {reason}
        </p>
      )}
      {(estimatedMinutes != null || boothCount != null) && (
        <div className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
          {boothCount != null && <span>부스 {boothCount}곳</span>}
          {estimatedMinutes != null && <span>약 {estimatedMinutes}분 동선</span>}
        </div>
      )}
    </div>
  );
}
