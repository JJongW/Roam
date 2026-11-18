"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, BellRing, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api/client";
import {
  isNotificationSupported,
  requestPermission,
  scheduleReminder,
} from "@/lib/push/notify";
import { dayKo, label, system } from "@/lib/copy/v1";
import type { SnackbarState } from "@/components/v2/snackbar";
import type { BoothEvent, WelcomeKit } from "@/lib/types";

/**
 * v1 상세에 있던 칸 가운데 브랜드 규칙에 맞는 것을 v2로 다시 세운다(W2, 2026-11-18).
 * - 이벤트: UI/시간표 줄(Figma 3002:4558). 시각 48 폭 + 이름과 곳. 끝난 것은 연한 글자, 동작 없음.
 *   "상시" 묶음이 먼저, 다음 날짜순. 시작 전 이벤트는 알림 받기(이 탭이 열려 있을 때만 울리는
 *   브라우저 알림. 서버 푸시가 아니다, `lib/push/notify.ts`).
 * - 웰컴 키트, 다른 행사에서도, 함께 입점한 곳: 정보 줄과 같은 글자 위계.
 * - 이벤트 제목과 설명, 웰컴 키트 글은 주최나 브랜드가 쓴 원문이라 고치지 않는다(브랜드 규칙 §1 예외).
 */

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function groups(events: BoothEvent[]) {
  const out: { title: string; events: BoothEvent[] }[] = [];
  const standing = events.filter((e) => e.standing);
  // 상시는 머리 없이 맨 앞에(시각 칸에 "상시"가 이미 보인다).
  if (standing.length) out.push({ title: "", events: standing });
  const byDay = new Map<string, BoothEvent[]>();
  for (const e of events
    .filter((x) => !x.standing)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))) {
    const k = dayKo(e.startTime);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }
  for (const [title, list] of byDay) out.push({ title, events: list });
  return out;
}

export function EventsSection({
  events,
  show,
}: {
  events: BoothEvent[];
  show: (s: Omit<SnackbarState, "key">) => void;
}) {
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  // 지금 시각은 처음 그릴 때 한 번만 잰다(렌더마다 바뀌지 않게).
  const [now] = useState(() => Date.now());
  if (events.length === 0) return null;

  const remind = async (e: BoothEvent) => {
    if (!isNotificationSupported())
      return show({ message: system.eventNoNotification });
    if ((await requestPermission()) !== "granted")
      return show({ message: system.eventNeedPermission });
    const result = scheduleReminder(
      e.title,
      system.eventSoon,
      Date.parse(e.startTime),
    );
    if (result !== "scheduled")
      return show({ message: system.eventRemindFailed });
    // 고른 이벤트는 계정 기록으로도 남긴다(알림을 보내는 데 쓰이지는 않는다).
    await api
      .post("/api/bookmarks", { targetType: "event", targetId: e.id })
      .catch(() => {});
    setReminded((s) => new Set(s).add(e.id));
    show({ message: system.eventReminded });
  };

  return (
    <section className="flex flex-col border-t border-v2-stroke-neutral-muted pt-v2-x4">
      <h2 className="px-v2-x4 text-v2-t4 font-v2-bold text-v2-fg-neutral">
        {label.events}
      </h2>
      {groups(events).map((g) => (
        <div key={g.title || "standing"} className="flex flex-col pt-v2-x2">
          {g.title && (
            <h3 className="px-v2-x4 pt-v2-x1 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
              {g.title}
            </h3>
          )}
          <ul>
            {g.events.map((e) => {
              const ended = !e.standing && Date.parse(e.endTime) < now;
              const live =
                !e.standing && !ended && Date.parse(e.startTime) <= now;
              const on = reminded.has(e.id);
              const sub = [
                e.tag,
                e.speaker,
                e.standing
                  ? system.eventStandingOp
                  : `${hhmm(e.startTime)} ~ ${hhmm(e.endTime)}`,
              ]
                .filter(Boolean)
                .join(", ");
              return (
                <li
                  key={e.id}
                  className={clsx(
                    "flex items-center gap-v2-x4 px-v2-x4 py-v2-x3 font-v2-medium",
                    ended ? "text-v2-fg-neutral-muted" : "text-v2-fg-neutral",
                  )}
                >
                  <span className="w-v2-x12 shrink-0 text-v2-t5">
                    {e.standing ? label.standing : hhmm(e.startTime)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5">
                    <span className="break-words text-v2-t5">{e.title}</span>
                    <span className="break-words text-v2-t3 text-v2-fg-neutral-muted">
                      {sub}
                    </span>
                    {e.description && (
                      <span className="break-words text-v2-t3 text-v2-fg-neutral-muted">
                        {e.description}
                      </span>
                    )}
                  </span>
                  {live && (
                    <span className="shrink-0 text-v2-t4 font-v2-bold text-v2-fg-brand">
                      {system.eventLive}
                    </span>
                  )}
                  {!e.standing && !ended && !live && (
                    <button
                      type="button"
                      aria-label={label.eventRemind}
                      aria-pressed={on}
                      onClick={() => void remind(e)}
                      className="flex size-v2-x11 shrink-0 items-center justify-center rounded-v2-full text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
                    >
                      {on ? (
                        <BellRing
                          aria-hidden
                          className="size-[var(--roam-v2-icon-size-md)] text-v2-fg-brand"
                        />
                      ) : (
                        <Bell
                          aria-hidden
                          className="size-[var(--roam-v2-icon-size-md)]"
                        />
                      )}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function WelcomeKitSection({ kit }: { kit?: WelcomeKit }) {
  if (!kit?.enabled) return null;
  return (
    <section className="flex flex-col gap-v2-x1 border-t border-v2-stroke-neutral-muted p-v2-x4">
      <h2 className="text-v2-t4 font-v2-bold text-v2-fg-neutral">
        {label.welcomeKit}
      </h2>
      <div className="flex items-center gap-v2-x3 py-v2-x1-5">
        <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5">
          <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">
            {kit.name}
          </span>
          {kit.description && (
            <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
              {kit.description}
            </span>
          )}
        </span>
        <span className="flex min-h-v2-x6 shrink-0 items-center rounded-v2-r1-5 bg-v2-bg-neutral-weak px-v2-x2 py-v2-x1 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
          {system.welcomeKitPrepared(kit.remainingCount)}
        </span>
      </div>
    </section>
  );
}

export interface Appearance {
  boothId: string;
  exhibitionName: string;
  displayName: string;
  boothCode?: string;
}

/** 같은 브랜드의 다른 행사 출전. 그 행사에 적힌 이름 그대로(설계 2026-10-02 §3). */
export function AppearancesSection({ items }: { items: Appearance[] }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col border-t border-v2-stroke-neutral-muted pt-v2-x4">
      <h2 className="px-v2-x4 text-v2-t4 font-v2-bold text-v2-fg-neutral">
        {label.otherFairs}
      </h2>
      <ul className="pb-v2-x2 pt-v2-x1">
        {items.map((a) => (
          <li key={a.boothId}>
            <Link
              href={`/booths/${a.boothId}`}
              className="flex w-full items-center gap-v2-x3 px-v2-x4 py-v2-x3 active:bg-v2-bg-layer-default-pressed"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5">
                <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">
                  {a.exhibitionName}
                </span>
                <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                  {[`‘${a.displayName}’`, a.boothCode]
                    .filter(Boolean)
                    .join(" ")}
                </span>
              </span>
              <ChevronRight
                aria-hidden
                className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral-muted"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** 한 부스 자리에 함께 들어온 브랜드 이름(주최 목록 원문). */
export function AliasesSection({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return (
    <section className="flex flex-col gap-v2-x2 border-t border-v2-stroke-neutral-muted p-v2-x4">
      <h2 className="text-v2-t4 font-v2-bold text-v2-fg-neutral">
        {label.togetherBooths(names.length)}
      </h2>
      <div className="flex flex-wrap gap-v2-x1-5">
        {names.map((n) => (
          <span
            key={n}
            className="flex min-h-v2-x6 items-center rounded-v2-r1-5 bg-v2-bg-neutral-weak px-v2-x2 py-v2-x1 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted"
          >
            {n}
          </span>
        ))}
      </div>
    </section>
  );
}
