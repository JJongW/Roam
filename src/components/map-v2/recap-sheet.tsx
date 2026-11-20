"use client";

import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import { readRecap, RECAP_MAX, saveRecap } from "@/lib/recap/visit-memory";
import { dayKo, label, romi, system } from "@/lib/copy/v1";
import { lenBucket, SCREEN, track } from "@/lib/analytics/app-track";

/**
 * UI 12-02 쓰기 → 12-03 쓴 말 그대로 → (로그인 안 한 분) 12-04 로그인 권하기.
 * 입구는 로미 시트 맨 아래 "오늘은 여기까지 할게요"(12-01)이고 열린 날에만 열린다.
 * 쓴 말은 고치지 않고 이 브라우저에만 둔다(서버에 글 칸이 없다, 11-17 회고 글 기기만).
 * 숫자 칸은 0인 것은 뺀다(세지 않은 것을 재촉하지 않는다).
 */
export function RecapSheet({
  slug,
  fairName,
  stats,
  signedIn,
  onClose,
}: {
  slug: string;
  fairName: string;
  stats: { visited: number; good: number; memos: number };
  signedIn: boolean;
  onClose: () => void;
}) {
  // 시트는 누른 뒤에만 열려 브라우저 저장소를 바로 읽어도 된다. 전에 남긴 말이 있으면 이어서 쓴다.
  const [text, setText] = useState(() => readRecap(slug).text);
  const [saved, setSaved] = useState<{ text: string; date: string | null } | null>(null);
  useEffect(() => {
    track("recap_start", {
      screen: SCREEN.recapWrite,
      exhibitionSlug: slug,
      props: { from: "romi_sheet" },
    });
  }, [slug]);
  const empty = text.trim().length === 0;
  const ctx = (screen: (typeof SCREEN)[keyof typeof SCREEN]) => ({ screen, exhibitionSlug: slug });

  if (!saved)
    return (
      <BottomSheet ariaLabel={romi.recapAsk} onClose={onClose} tall>
        <div className="flex items-start gap-v2-x3">
          <RomiAvatar size="md" />
          <div className="flex flex-col gap-v2-x1 font-v2-medium">
            <h2 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
              {romi.recapAsk}
            </h2>
            <p className="text-v2-t3 text-v2-fg-neutral-muted">{romi.recapKeep}</p>
          </div>
        </div>
        <textarea
          autoFocus
          rows={5}
          maxLength={RECAP_MAX}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, RECAP_MAX))}
          placeholder={label.recapPlaceholder}
          aria-label={label.recapPlaceholder}
          className="min-h-v2-x28 w-full resize-none rounded-v2-field bg-v2-bg-neutral-weak p-v2-x4 text-v2-t5 text-v2-fg-neutral outline-none placeholder:text-v2-fg-placeholder"
        />
        <button
          type="button"
          disabled={empty}
          onClick={() => {
            if (!saveRecap(slug, text)) return;
            track("recap_save", {
              ...ctx(signedIn ? SCREEN.recapSaved : SCREEN.recapLoggedOut),
              props: { len_bucket: lenBucket(text.trim().length) },
            });
            setSaved(readRecap(slug));
          }}
          className={clsx(
            "flex min-h-v2-x12 w-full items-center justify-center rounded-v2-field text-v2-t5 font-v2-bold",
            empty
              ? "bg-v2-bg-neutral-weak text-v2-fg-neutral-muted"
              : "bg-v2-bg-brand-solid text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed",
          )}
        >
          {label.leave}
        </button>
        <Quiet onClick={onClose}>{label.later}</Quiet>
      </BottomSheet>
    );

  const cells = [
    [label.placesStat(stats.visited), label.visitedPlaces, stats.visited],
    [label.placesStat(stats.good), label.verdict.good, stats.good],
    [label.memoStat(stats.memos), label.memo, stats.memos],
  ].filter(([, , n]) => (n as number) > 0) as [string, string, number][];

  return (
    <BottomSheet ariaLabel={romi.recapSaved} onClose={onClose} tall>
      <div className="flex items-center gap-v2-x3">
        <RomiAvatar size="md" />
        <h2 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
          {romi.recapSaved}
        </h2>
      </div>
      <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
        {system.recapMeta(fairName, dayKo(saved.date ?? new Date().toISOString()))}
      </p>
      <p className="whitespace-pre-wrap rounded-v2-r3 bg-v2-bg-neutral-weak p-v2-x4 text-v2-t5 text-v2-fg-neutral">
        {saved.text}
      </p>
      {cells.length > 0 && (
        <div className="flex gap-v2-x2">
          {cells.map(([value, name]) => (
            <div
              key={name}
              className="flex flex-1 flex-col items-center gap-v2-x0-5 rounded-v2-r3 bg-v2-bg-neutral-weak py-v2-x3"
            >
              <span className="text-v2-t7 font-v2-bold text-v2-fg-neutral">{value}</span>
              <span className="text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">{name}</span>
            </div>
          ))}
        </div>
      )}
      {signedIn ? (
        <Primary onClick={onClose}>{label.close}</Primary>
      ) : (
        <>
          <p className="whitespace-pre-line text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
            {system.recapDeviceOnly}
          </p>
          <Primary
            onClick={() => {
              track("recap_login_choice", { ...ctx(SCREEN.recapLoggedOut), props: { choice: "login" } });
              location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
            }}
          >
            {label.login}
          </Primary>
          <Quiet
            onClick={() => {
              track("recap_login_choice", { ...ctx(SCREEN.recapLoggedOut), props: { choice: "later" } });
              onClose();
            }}
          >
            {label.later}
          </Quiet>
        </>
      )}
    </BottomSheet>
  );
}

function Primary({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-v2-x12 w-full items-center justify-center rounded-v2-field bg-v2-bg-brand-solid text-v2-t5 font-v2-bold text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
    >
      {children}
    </button>
  );
}

function Quiet({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-v2-x11 w-full items-center justify-center text-v2-t4 font-v2-medium text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
    >
      {children}
    </button>
  );
}
