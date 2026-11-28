"use client";

import { useEffect, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import Link from "next/link";
import { Check, ChevronRight, RefreshCw } from "lucide-react";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { ChoiceChip } from "@/components/v2/choice-chip";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import { hasRealBlurb } from "@/lib/booth/blurb";
import { boothAbout } from "@/lib/booth/about";
import { entryCopy } from "@/lib/copy/map-entry";
import { label } from "@/lib/copy/v1";
import { MOOD_PHOTO_COUNT, MOOD_PICK_COUNT, canRefreshMood, refreshMood } from "@/lib/onboarding/fair-entry";
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
 * UI 1-02 사진 고르기 시트. 이 박람회 부스 사진 여섯 장에서 두 장 이상(상한 없음).
 * 2026-11-28 Ted: 두 장이 되면 바로 넘어가던 것을 없애고 "골랐어요"를 눌러 지도로 간다(두 장 미만이면 꺼짐).
 * "다른 사진 보기"는 고르지 않은 칸만 아직 안 보여 준 사진으로 바꾼다(Figma 섹션 24에는 아직 없다).
 * 고른 것은 바꿔도 쌓인다. 건너뛰면 그대로 지도. 바깥을 눌러 닫아도 건너뛴 것으로 센다.
 */
export function MoodSheet({
  fairName,
  pool,
  onPicked,
  onSkip,
}: {
  fairName: string;
  /** `moodPool` 차례 전부. 앞 여섯 장을 먼저 보인다. */
  pool: BoothListItem[];
  onPicked: (ids: string[]) => void;
  onSkip: () => void;
}) {
  const [shown, setShown] = useState(() => pool.slice(0, MOOD_PHOTO_COUNT));
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set(shown.map((b) => b.id)));
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const refresh = () => {
    const next = refreshMood(shown, picked, pool, seen);
    setShown(next);
    setSeen(new Set([...seen, ...next.map((b) => b.id)]));
  };
  const canRefresh = canRefreshMood(shown, picked, pool, seen);
  const ready = picked.length >= MOOD_PICK_COUNT;
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
        {shown.map((b) => {
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
                <img src={b.images.find(Boolean)} alt="" loading="eager" className="size-full object-cover" />
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
      {/* 아래 묶음은 시트 바닥에 붙어 있다. 작은 화면에서 사진이 길어져도 "골랐어요"가 가려지지 않는다. */}
      <div className="sticky bottom-0 flex flex-col gap-v2-x2 bg-v2-bg-layer-floating pt-v2-x2">
        <p className="text-center text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{entryCopy.moodHint}</p>
        <div className="flex gap-v2-x2">
          <button
            type="button"
            onClick={refresh}
            disabled={!canRefresh}
            className="flex min-h-v2-x12 shrink-0 items-center justify-center gap-v2-x1 rounded-v2-field px-v2-x3 text-v2-t4 font-v2-bold text-v2-fg-neutral active:bg-v2-bg-transparent-pressed disabled:text-v2-fg-disabled"
          >
            <RefreshCw aria-hidden className="size-[var(--roam-v2-icon-size-sm)]" />
            {entryCopy.moodRefresh}
          </button>
          <button
            type="button"
            onClick={() => onPicked(picked)}
            disabled={!ready}
            className="flex min-h-v2-x12 flex-1 items-center justify-center rounded-v2-field bg-v2-bg-brand-solid text-v2-t5 font-v2-bold text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed disabled:bg-v2-bg-disabled disabled:text-v2-fg-disabled"
          >
            {entryCopy.moodDone}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}

/**
 * 1-05 카드와 UI 24 미리보기 시트가 함께 쓰는 한 줄 소개. 부스 소개(저작 요약 → 브랜드가 쓴 소개글 순, iOS #211과 같다).
 * 시드가 합성한 소개는 쓰지 않고, 없으면 확인된 고른 이유("고르신 사진의 부스예요.")를 쓴다. 소개글은 고치지 않는다(브랜드 규칙 §1 예외).
 */
export function pickIntro(booth: BoothListItem, reason: string): string {
  const summary = booth.enrichment?.summary?.trim();
  return (
    summary ||
    (hasRealBlurb(booth.description, booth) ? booth.description.trim() : undefined) ||
    reason
  );
}

/** 1-05 카드와 미리보기 시트 머리의 로미 줄: 머리 글, 진행(1 / 3), "나중에 할게요". */
function PickRomiRow({
  head,
  index,
  total,
  onLater,
  live,
}: {
  head: string;
  index: number;
  total: number;
  onLater: () => void;
  /** 카드에서만 바뀐 머리 줄을 읽어 준다(시트는 열릴 때 대화상자 이름으로 읽힌다). */
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-v2-x2">
      <RomiAvatar size="md" />
      <p
        role={live ? "status" : undefined}
        aria-live={live ? "polite" : undefined}
        className="min-w-0 flex-1 text-v2-t3 font-v2-medium text-v2-fg-neutral"
      >
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
  );
}

/** 이름과 번호(카드와 시트가 같다). */
function PickName({ name, code }: { name: string; code?: string }) {
  return (
    <span className="flex min-w-0 items-baseline gap-v2-x2">
      <span className="truncate text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">{name}</span>
      {code && <span className="shrink-0 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{code}</span>}
    </span>
  );
}

const PICK_BUTTON =
  "flex min-h-v2-x10 flex-1 items-center justify-center rounded-v2-r2 px-v2-x4 py-v2-x2-5 text-v2-t4 font-v2-bold text-v2-fg-neutral active:bg-v2-bg-transparent-pressed";

/**
 * UI 1-05, 1-06 고르신 사진으로 고른 세 곳. 지도에서 그 부스 칸이 골라진 채로 카드가 뜬다.
 * 머리 줄: 처음엔 "고르신 사진으로 세 곳을 골라 봤어요", 하트를 남긴 뒤엔 "‘숲향초’에 하트를 남겼어요".
 * 이유는 확인된 것만 말한다("고르신 사진의 부스예요", "같은 문구 분류예요"). 취향을 안다고 하지 않는다(§5).
 * 이름 줄(오른쪽 화살표)을 누르면 반쯤 올라오는 미리보기 시트(UI 24 Q2A-1, 2026-11-25 Ted 결정).
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
  onPreview,
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
  /** UI 24 Q2A-1 이름 줄을 누르면 미리보기 시트. */
  onPreview: () => void;
}) {
  const intro = pickIntro(booth, reason);
  return (
    <section
      aria-label={booth.name}
      className="pointer-events-auto flex flex-col gap-v2-x2 rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4 shadow-v2-s2"
    >
      <PickRomiRow head={head} index={index} total={total} onLater={onLater} live />
      <button
        type="button"
        onClick={onPreview}
        aria-haspopup="dialog"
        className="-mx-v2-x2 flex items-center gap-v2-x2 rounded-v2-r2 px-v2-x2 text-left active:bg-v2-bg-transparent-pressed"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-v2-x1">
          <PickName name={booth.name} code={code} />
          <span className="truncate text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{intro}</span>
        </span>
        <ChevronRight aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral" />
      </button>
      <div className="flex gap-v2-x2 pt-v2-x1">
        <button type="button" onClick={onHeart} className={clsx(PICK_BUTTON, "bg-v2-bg-neutral-weak")}>
          {entryCopy.leaveHeart}
        </button>
        <button type="button" onClick={onNotThis} className={clsx(PICK_BUTTON, "border border-v2-stroke-neutral-muted")}>
          {entryCopy.notThis}
        </button>
      </div>
    </section>
  );
}

/**
 * UI 24 Q2A-2 로미가 고른 곳 미리보기(2026-11-25 Ted 결정, Figma 3311:23369). 1-05 카드 이름 줄을 누르면 반쯤 올라온다.
 * 위에서 아래로: 로미 줄(진행 그대로) → 사진 옆으로 넘김(세로 3:4) → 이름과 번호 → 분류 → 소개 세 줄 → 하트 남기기, 자세히 보기.
 *
 * - 아래로 밀거나 바깥을 누르면 같은 카드로 돌아간다(진행 그대로).
 * - 하트를 남기면 시트가 닫히고 1-06처럼 다음 곳(Q2A-3). 동작은 카드의 하트와 같다(호출부 pickAction).
 * - "자세히 보기"는 부스 상세(UI 4-02). 뒤로 오면 이 시트로(호출부가 진행을 이 탭에 잠깐 남긴다).
 * - 소개는 브랜드가 쓴 말 그대로 고치지 않는다. 열리면 상세와 같은 출처(브랜드 공식 소개 우선, lib/brands/intro.ts)를
 *   한 번 읽어 바꾸고, 읽기 전이나 실패하면 카드와 같은 한 줄 소개를 쓴다.
 * - "이건 아니에요"는 시트에 없다(Figma Q2 A 단점 노트, 넣을지 미정). 카드로 돌아가 누른다.
 * - 사진이 없으면 사진 줄을 뺀다(상세 4-04와 같은 규칙).
 */
export function FirstPickPreviewSheet({
  booth,
  code,
  reason,
  categoryName,
  index,
  total,
  head,
  detailHref,
  onHeart,
  onLater,
  onDetail,
  onClose,
  onHeight,
}: {
  booth: BoothListItem;
  code?: string;
  reason: string;
  categoryName?: string;
  index: number;
  total: number;
  head: string;
  detailHref: string;
  onHeart: () => void;
  onLater: () => void;
  /** 상세로 가기 직전(진행을 남긴다). */
  onDetail: () => void;
  onClose: () => void;
  /** 시트 높이(px). 지도가 고른 칸을 시트 위로 옮기는 데 쓴다(24-Q2A-2). */
  onHeight?: (h: number) => void;
}) {
  const [fullIntro, setFullIntro] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch(`/api/booths/${encodeURIComponent(booth.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: { booth: BoothListItem & { longDescription?: string }; brandIntro?: { text: string } | null } } | null) => {
        const d = j?.data;
        if (!alive || !d) return;
        const about = boothAbout(d.booth);
        const text = d.brandIntro?.text ?? about.quote ?? about.fallback;
        if (text) setFullIntro({ id: booth.id, text });
      })
      .catch(() => {
        /* 못 읽으면 카드의 한 줄 소개를 그대로 쓴다 */
      });
    return () => {
      alive = false;
    };
  }, [booth.id]);
  const intro = fullIntro?.id === booth.id ? fullIntro.text : pickIntro(booth, reason);
  return (
    <BottomSheet ariaLabel={booth.name} onClose={onClose} swipeToClose onHeight={onHeight}>
      <div className="flex flex-col gap-v2-x3 pt-v2-x1">
        <PickRomiRow head={head} index={index} total={total} onLater={onLater} />
        {booth.images.length > 0 && (
          <ul aria-label={label.photo} className="-mr-v2-x4 flex gap-v2-x2 overflow-x-auto pr-v2-x4">
            {booth.images.map((src, i) => (
              <li key={src + i} className="w-2/5 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- 브랜드 사진은 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다 */}
                <img
                  src={src}
                  alt={`${booth.name} ${label.photo} ${i + 1}`}
                  loading={i < 2 ? "eager" : "lazy"}
                  className="aspect-3/4 w-full rounded-v2-r3 bg-v2-bg-neutral-weak object-cover"
                />
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col items-start gap-v2-x2">
          <PickName name={booth.name} code={code} />
          {categoryName && (
            <span className="flex min-h-v2-x6 items-center rounded-v2-r1-5 bg-v2-bg-neutral-weak px-v2-x2 py-v2-x1 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
              {categoryName}
            </span>
          )}
          <p className="line-clamp-3 whitespace-pre-line break-words text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
            {intro}
          </p>
        </div>
        <div className="flex gap-v2-x2 pt-v2-x1">
          <button type="button" onClick={onHeart} className={clsx(PICK_BUTTON, "bg-v2-bg-neutral-weak")}>
            {entryCopy.leaveHeart}
          </button>
          <Link
            href={detailHref}
            onClick={onDetail}
            className={clsx(PICK_BUTTON, "border border-v2-stroke-neutral-muted")}
          >
            {entryCopy.seeDetail}
          </Link>
        </div>
      </div>
    </BottomSheet>
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
