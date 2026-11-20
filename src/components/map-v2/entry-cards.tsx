"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { Check } from "lucide-react";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { ChoiceChip } from "@/components/v2/choice-chip";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import { hasRealBlurb } from "@/lib/booth/blurb";
import { entryCopy } from "@/lib/copy/map-entry";
import { label } from "@/lib/copy/v1";
import { MOOD_PICK_COUNT } from "@/lib/onboarding/fair-entry";
import type { VerdictValue } from "@/lib/stores/visit";
import type { BoothListItem } from "@/lib/types";

/** 온보딩 단계 막대(1-02 첫 칸, 1-04 둘째 칸까지). 세 칸. */
export function StepBars({ done }: { done: number }) {
  return (
    <div aria-hidden className="flex gap-v2-x1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={clsx(
            "h-v2-x1 w-v2-x6 rounded-v2-full",
            i < done ? "bg-v2-bg-brand-solid" : "bg-v2-bg-neutral-weak",
          )}
        />
      ))}
    </div>
  );
}

export interface EntryAction {
  label: string;
  onClick: () => void;
}

/**
 * 지도 아래 로미 카드, 로미가 왼쪽에 있는 생김새(Figma 1-04, 1-09, 1-10, 11-04~11-06).
 * 로미는 묻는 사람이라 말 옆에 선다. 동작은 아래 두 칸(같은 무게) 또는 자식으로 받는다.
 */
export function EntryCard({
  title,
  sub,
  top,
  topRight,
  actions,
  children,
}: {
  title: string;
  sub?: string;
  /** 카드 맨 위 줄 왼쪽(단계 막대) */
  top?: ReactNode;
  /** 맨 위 줄 오른쪽 또는 제목 줄 오른쪽 글자 동작("나중에 할게요", "닫기") */
  topRight?: EntryAction;
  actions?: EntryAction[];
  children?: ReactNode;
}) {
  const right = topRight && (
    <button
      type="button"
      onClick={topRight.onClick}
      className="-mr-v2-x2 flex min-h-v2-x9 shrink-0 items-center rounded-v2-r2 px-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
    >
      {topRight.label}
    </button>
  );
  return (
    <section
      role="status"
      aria-live="polite"
      className="pointer-events-auto flex flex-col gap-v2-x3 rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4 shadow-v2-s2"
    >
      {top && (
        <div className="flex items-center justify-between">
          {top}
          {right}
        </div>
      )}
      <div className="flex items-start gap-v2-x3">
        <RomiAvatar size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 font-v2-medium">
          <p className="text-v2-t5 text-v2-fg-neutral">{title}</p>
          {sub && <p className="whitespace-pre-line text-v2-t3 text-v2-fg-neutral-muted">{sub}</p>}
        </div>
        {!top && right}
      </div>
      {children}
      {actions && actions.length > 0 && (
        <div className="flex gap-v2-x2">
          {actions.map((a, i) => (
            <button
              key={a.label}
              type="button"
              onClick={a.onClick}
              className={clsx(
                "flex min-h-v2-x11 flex-1 items-center justify-center rounded-v2-r2 px-v2-x3 text-v2-t4 font-v2-bold text-v2-fg-neutral",
                i === 0
                  ? "bg-v2-bg-neutral-weak active:bg-v2-bg-transparent-pressed"
                  : "active:bg-v2-bg-transparent-pressed",
              )}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * UI 1-02 사진 고르기 시트(1-03 두 장 고른 뒤). 이 박람회 부스 사진 여섯 장 중 두 장.
 * 두 장을 고르면 "두 장 고르셨네요. 이제 지도로 가요"를 잠깐 보이고 바로 지도로 간다(누르면 바로 다음, 11-11).
 * 건너뛰면 그대로 지도. 바깥을 눌러 닫아도 건너뛴 것으로 센다.
 */
export function MoodSheet({
  fairName,
  booths,
  onPicked,
  onSkip,
}: {
  fairName: string;
  booths: BoothListItem[];
  onPicked: (ids: string[]) => void;
  onSkip: () => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  // 부모가 다시 그려도 타이머가 다시 돌지 않게 마지막 콜백만 잡아 둔다.
  const onPickedRef = useRef(onPicked);
  useEffect(() => {
    onPickedRef.current = onPicked;
  });
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => onPickedRef.current(picked), 700);
    return () => clearTimeout(t);
  }, [done, picked]);
  const toggle = (id: string) => {
    if (done) return;
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    if (next.length > MOOD_PICK_COUNT) return;
    setPicked(next);
    if (next.length === MOOD_PICK_COUNT) setDone(true);
  };
  return (
    <BottomSheet ariaLabel={entryCopy.welcome(fairName)} onClose={onSkip} tall>
      <div className="flex items-center justify-between">
        <StepBars done={1} />
        <button
          type="button"
          onClick={onSkip}
          className="-mr-v2-x2 flex min-h-v2-x9 items-center rounded-v2-r2 px-v2-x2 text-v2-t4 font-v2-medium text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
        >
          {entryCopy.skip}
        </button>
      </div>
      <div className="flex flex-col gap-v2-x2">
        <RomiAvatar size="md" />
        <h2 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
          {entryCopy.welcome(fairName)}
        </h2>
        <p className="text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">{entryCopy.moodBody}</p>
      </div>
      <ul className="grid grid-cols-2 gap-v2-x2">
        {booths.map((b) => {
          const on = picked.includes(b.id);
          return (
            <li key={b.id}>
              <button
                type="button"
                aria-pressed={on}
                aria-label={entryCopy.moodPhoto(b.name)}
                onClick={() => toggle(b.id)}
                className={clsx(
                  "relative block aspect-4/3 w-full overflow-hidden rounded-v2-r3 border-2 bg-v2-bg-neutral-weak",
                  on ? "border-v2-bg-brand-solid" : "border-v2-bg-transparent",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- 브랜드 사진은 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다 */}
                <img src={b.images[0]} alt="" loading="eager" className="size-full object-cover" />
                {on && (
                  <span className="absolute right-v2-x2 top-v2-x2 flex size-v2-x6 items-center justify-center rounded-v2-full bg-v2-bg-brand-solid text-v2-fg-on-brand-solid">
                    <Check aria-hidden strokeWidth={3} className="size-[var(--roam-v2-icon-size-sm)]" />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      <p
        role="status"
        aria-live="polite"
        className="text-center text-v2-t4 font-v2-medium text-v2-fg-neutral"
      >
        {done ? entryCopy.moodDone : entryCopy.moodHint}
      </p>
    </BottomSheet>
  );
}

/**
 * UI 1-05, 1-06 고르신 사진으로 고른 세 곳. 지도에서 그 부스 칸이 골라진 채로 카드가 뜬다.
 * 머리 줄: 처음엔 "고르신 사진으로 세 곳을 골라 봤어요", 하트를 남긴 뒤엔 "‘숲향초’에 하트를 남겼어요".
 * 이유는 확인된 것만 말한다("고르신 사진의 부스예요", "같은 문구 분류예요"). 취향을 안다고 하지 않는다(§5).
 */
export function FirstPickCard({
  booth,
  code,
  reason,
  index,
  total,
  head,
  onHeart,
  onNotThis,
  onLater,
}: {
  booth: BoothListItem;
  code?: string;
  reason: string;
  index: number;
  total: number;
  head: string;
  onHeart: () => void;
  onNotThis: () => void;
  /** 로미 줄 오른쪽 "나중에 할게요"(11-20 Figma 3238:21748). 카드를 닫고 지도로. */
  onLater: () => void;
}) {
  // 한 줄 소개는 부스 소개(저작 요약 → 브랜드가 쓴 소개글 순, iOS #211과 같다). 시드가 합성한 소개는 쓰지 않고,
  // 없으면 확인된 고른 이유("고르신 사진의 부스예요.")를 쓴다. 소개글은 고치지 않는다(브랜드 규칙 §1 예외).
  const summary = booth.enrichment?.summary?.trim();
  const intro =
    summary ||
    (hasRealBlurb(booth.description, booth) ? booth.description.trim() : undefined) ||
    reason;
  return (
    <section
      aria-label={booth.name}
      className="pointer-events-auto flex flex-col gap-v2-x2 rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4 shadow-v2-s2"
    >
      <div className="flex items-center gap-v2-x2">
        <RomiAvatar size="md" />
        <p role="status" aria-live="polite" className="min-w-0 flex-1 text-v2-t3 font-v2-medium text-v2-fg-neutral">
          {head}
        </p>
        <span className="shrink-0 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
          {entryCopy.progress(index + 1, total)}
        </span>
        {/* 글자는 caption 12 Regular, 누르는 자리는 44(iOS FirstPickCard 와 같다). */}
        <button
          type="button"
          onClick={onLater}
          className="-mx-v2-x2 flex min-h-v2-x11 shrink-0 items-center rounded-v2-r2 px-v2-x2 text-v2-t2 font-v2-regular text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
        >
          {entryCopy.later}
        </button>
      </div>
      <div className="flex flex-col gap-v2-x1">
        <p className="flex items-baseline gap-v2-x2">
          <span className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">{booth.name}</span>
          {code && <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{code}</span>}
        </p>
        <p className="truncate text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{intro}</p>
      </div>
      <div className="flex gap-v2-x2">
        <button
          type="button"
          onClick={onHeart}
          className="flex min-h-v2-x10 flex-1 items-center justify-center rounded-v2-r2 bg-v2-bg-neutral-weak px-v2-x4 py-v2-x2-5 text-v2-t4 font-v2-bold text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
        >
          {entryCopy.leaveHeart}
        </button>
        <button
          type="button"
          onClick={onNotThis}
          className="flex min-h-v2-x10 flex-1 items-center justify-center rounded-v2-r2 border border-v2-stroke-neutral-muted px-v2-x4 py-v2-x2-5 text-v2-t4 font-v2-bold text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
        >
          {entryCopy.notThis}
        </button>
      </div>
    </section>
  );
}

const VERDICTS: VerdictValue[] = ["good", "ok", "bad"];

/** 11-04, 11-05 M4: 끝난 박람회 지도에서 다녀오신 곳을 한 곳씩 묻는다. 칩을 누르면 다음 곳으로. */
export function VerdictAskMapCard({
  name,
  place,
  onPick,
  onLater,
}: {
  name: string;
  place?: string;
  onPick: (v: VerdictValue) => void;
  onLater: () => void;
}) {
  return (
    <EntryCard
      title={entryCopy.howWas(name)}
      sub={place ? entryCopy.visitedBefore(place) : entryCopy.visitedBeforeNoPlace}
      topRight={{ label: entryCopy.later, onClick: onLater }}
    >
      <div className="flex flex-wrap gap-v2-x2">
        {VERDICTS.map((v) => (
          <ChoiceChip key={v} on={false} onClick={() => onPick(v)}>
            {label.verdict[v]}
          </ChoiceChip>
        ))}
      </div>
    </EntryCard>
  );
}

/** 지도 위 날짜 알약(10-01 "12월 11일에 열려요", 11-04 "11월 9일에 끝났어요"). 누르는 것이 아니다. */
export function DatePill({ text, icon }: { text: string; icon: ReactNode }) {
  return (
    <span className="pointer-events-auto flex min-h-v2-x9 items-center gap-v2-x1-5 rounded-v2-pill border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating px-v2-x3 text-v2-t3 font-v2-medium text-v2-fg-neutral shadow-v2-s2">
      {icon}
      {text}
    </span>
  );
}
