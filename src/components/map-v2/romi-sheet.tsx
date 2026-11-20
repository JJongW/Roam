"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Heart, Search } from "lucide-react";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import { isHearted, isVisited, type BoothRecord } from "@/lib/stores/visit";
import { label, romi, system, type AmenityId } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { BoothListItem } from "@/lib/types";

/** 부스 이름, 브랜드, 번호, 다른 이름으로 찾는다(지도 찾기 줄과 같은 규칙). 편의시설은 뺀다. */
export function matchBooths(booths: BoothListItem[], query: string): BoothListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return booths.filter(
    (b) =>
      b.kind !== "facility" &&
      [b.name, b.company, b.code, ...(b.aliases ?? [])].some((t) =>
        t?.toLowerCase().includes(q),
      ),
  );
}

type Page = "main" | "left" | "where";

/**
 * UI 7 로미 시트(R-A, 11-11). 지도 아래 로미 알약을 누르면 반쯤 올라온다.
 * - 7-01 남긴 것: 하트 남긴 곳, 다녀온 곳 → 7-03 목록 → 부스 상세(메모는 상세에서 쓴다).
 * - 물어보기 칩: "'X' 가는 길"(UI 9), 이 지도에 있는 편의시설, "지금 어디인지 알려 주기".
 *   칩은 이 박람회에 실제로 있는 것만 보인다(없는 걸 묻게 하지 않는다).
 * - 12-01 맨 아래 "오늘은 여기까지 할게요": 열린 날에만 회고(12-02)로, 아니면 닫기만.
 * 웹에 없는 기능(로미에게 묻기 입력, 부스 목록, 오늘 프로그램, 제가 알고 있는 것)은 줄을 두지 않는다.
 * 남긴 것은 이 박람회 것만이다. 웹은 하트를 남긴 시각이 없어 "오늘"만 가르지 않는다.
 */
export function RomiSheet({
  booths,
  records,
  hallOf,
  exhibitionSlug,
  isOpenDay,
  canRoute,
  facilities,
  onRoute,
  onFacility,
  onWhereFound,
  onDoneForToday,
  onClose,
}: {
  booths: BoothListItem[];
  records: Record<string, BoothRecord>;
  hallOf: (b: BoothListItem) => string | undefined;
  exhibitionSlug: string;
  isOpenDay: boolean;
  /** 열린 날이고 배치도가 있을 때만 길 안내를 묻는다. */
  canRoute: boolean;
  facilities: { id: AmenityId; title: string }[];
  onRoute: (boothId: string) => void;
  onFacility: (id: AmenityId) => void;
  onWhereFound: (b: BoothListItem) => void;
  onDoneForToday: () => void;
  onClose: () => void;
}) {
  const [page, setPage] = useState<Page>("main");
  const [query, setQuery] = useState("");
  const ctx = { screen: SCREEN.romiSheet, exhibitionSlug };

  const placed = booths.filter((b) => b.kind !== "facility");
  const hearted = placed.filter((b) => isHearted(records[b.id]));
  const visited = placed.filter((b) => isVisited(records[b.id]));
  const left = placed.filter(
    (b) =>
      isHearted(records[b.id]) ||
      isVisited(records[b.id]) ||
      !!records[b.id]?.memo?.trim(),
  );
  const hasLeft = hearted.length > 0 || visited.length > 0;
  const names = (list: BoothListItem[]) =>
    list
      .slice(0, 3)
      .map((b) => b.name)
      .join(", ") + (list.length > 3 ? label.andMore(list.length - 3) : "");
  // 가는 길 칩: 아직 안 다녀온 하트 부스 하나(없으면 하트 첫 곳).
  const routeChip = canRoute
    ? (hearted.find((b) => !isVisited(records[b.id])) ?? hearted[0])
    : undefined;

  if (page === "left")
    return (
      <BottomSheet ariaLabel={label.leftSection} onClose={onClose}>
        <SubHeader title={label.leftSection} onBack={() => setPage("main")} />
        <ul className="flex flex-col">
          {left.map((b) => {
            const r = records[b.id];
            const bits = [
              label.hallNumber(hallOf(b), b.code),
              isHearted(r) && label.kindHeart,
              isVisited(r) && label.visited,
              r?.memo?.trim() && label.kindMemo,
            ].filter(Boolean);
            return (
              <li key={b.id}>
                <Link
                  href={`/booths/${b.id}`}
                  className="flex items-center gap-v2-x3 py-v2-x3 active:bg-v2-bg-transparent-pressed"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 font-v2-medium">
                    <span className="truncate text-v2-t5 text-v2-fg-neutral">{b.name}</span>
                    <span className="text-v2-t3 text-v2-fg-neutral-muted">{bits.join(", ")}</span>
                  </span>
                  {isHearted(r) && (
                    <Heart
                      aria-hidden
                      className="size-[var(--roam-v2-icon-size-md)] shrink-0 fill-v2-fg-brand text-v2-fg-brand"
                    />
                  )}
                  <ChevronRight
                    aria-hidden
                    className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral-muted"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </BottomSheet>
    );

  if (page === "where") {
    const found = matchBooths(booths, query).slice(0, 6);
    const typed = query.trim().length > 0;
    return (
      <BottomSheet ariaLabel={label.whereNow} onClose={onClose}>
        <SubHeader title={label.whereNow} onBack={() => setPage("main")} />
        <div className="flex flex-col gap-v2-x1 font-v2-medium">
          <p className="text-v2-t5 text-v2-fg-neutral">{romi.whereAsk}</p>
          <p className="text-v2-t3 text-v2-fg-neutral-muted">{romi.whereBody}</p>
        </div>
        <SearchField value={query} onChange={setQuery} placeholder={label.nearbyBoothName} />
        {typed && found.length === 0 ? (
          <p className="text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">{romi.whereNotFound}</p>
        ) : (
          <BoothRows
            booths={found}
            hallOf={hallOf}
            records={records}
            action={label.here}
            onPick={(b) => {
              track("nearby_answer", {
                ...ctx,
                boothId: b.id,
                props: { result: "found", via: "romi_sheet" },
              });
              onWhereFound(b);
            }}
          />
        )}
      </BottomSheet>
    );
  }

  return (
    <BottomSheet ariaLabel={romi.sheetTitle} onClose={onClose}>
      <div className="flex items-start gap-v2-x3">
        <RomiAvatar size="lg" />
        <div className="flex flex-col gap-v2-x1 font-v2-medium">
          <h2 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
            {romi.sheetTitle}
          </h2>
          <p className="text-v2-t3 text-v2-fg-neutral-muted">
            {hasLeft ? romi.sheetBody : romi.sheetBodyEmpty}
          </p>
        </div>
      </div>

      <Section title={label.leftItems}>
        {hasLeft ? (
          <>
            {hearted.length > 0 && (
              <NavRow
                title={label.heartedPlaces}
                sub={names(hearted)}
                onClick={() => {
                  track("romi_row_tap", { ...ctx, props: { row: "left" } });
                  setPage("left");
                }}
              />
            )}
            {visited.length > 0 && (
              <NavRow
                title={label.visitedPlaces}
                sub={names(visited)}
                onClick={() => {
                  track("romi_row_tap", { ...ctx, props: { row: "left" } });
                  setPage("left");
                }}
              />
            )}
          </>
        ) : (
          <p className="py-v2-x2 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
            {system.leftNothing}
          </p>
        )}
      </Section>

      <Section title={label.ask}>
        <div className="flex flex-wrap gap-v2-between-chips">
          {routeChip && (
            <Chip
              onClick={() => {
                track("romi_row_tap", { ...ctx, boothId: routeChip.id, props: { row: "booth_route" } });
                onRoute(routeChip.id);
              }}
            >
              {label.routeTo(routeChip.name)}
            </Chip>
          )}
          {facilities.slice(0, 3).map((f) => (
            <Chip
              key={f.id}
              onClick={() => {
                track("romi_row_tap", { ...ctx, props: { row: "facility", facility: f.id } });
                onFacility(f.id);
              }}
            >
              {label.askFacility(f.title)}
            </Chip>
          ))}
          <Chip
            onClick={() => {
              track("romi_row_tap", { ...ctx, props: { row: "where_am_i" } });
              setPage("where");
            }}
          >
            {label.whereNow}
          </Chip>
        </div>
      </Section>

      <button
        type="button"
        onClick={isOpenDay ? onDoneForToday : onClose}
        className="flex min-h-v2-x11 w-full items-center justify-center text-v2-t4 font-v2-medium text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
      >
        {label.doneForToday}
      </button>
    </BottomSheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-v2-x1">
      <h3 className="text-v2-t3 font-v2-bold text-v2-fg-neutral-muted">{title}</h3>
      {children}
    </div>
  );
}

function NavRow({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-v2-x3 py-v2-x2-5 text-left active:bg-v2-bg-transparent-pressed"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 font-v2-medium">
        <span className="text-v2-t5 text-v2-fg-neutral">{title}</span>
        <span className="truncate text-v2-t3 text-v2-fg-neutral-muted">{sub}</span>
      </span>
      <ChevronRight
        aria-hidden
        className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral-muted"
      />
    </button>
  );
}

function Chip({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-v2-x10 items-center rounded-v2-pill border border-v2-stroke-neutral-weak bg-v2-bg-layer-default px-v2-x3-5 text-v2-t4 font-v2-medium text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
    >
      {children}
    </button>
  );
}

export function SubHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <div className="-ml-v2-x2 flex items-center gap-v2-x1">
      {onBack && (
        <button
          type="button"
          aria-label={label.back}
          onClick={onBack}
          className="flex size-v2-x11 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
        >
          <ChevronLeft aria-hidden strokeWidth={2} className="size-[var(--roam-v2-icon-size-lg)]" />
        </button>
      )}
      <h2 className="text-v2-t6 font-v2-bold text-v2-fg-neutral">{title}</h2>
    </div>
  );
}

export function SearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="flex min-h-v2-x12 items-center gap-v2-x2 rounded-v2-field bg-v2-bg-neutral-weak px-v2-x4">
      <Search aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral-muted" />
      <input
        type="text"
        autoFocus
        enterKeyHint="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-v2-bg-transparent text-v2-t5 text-v2-fg-neutral outline-none placeholder:text-v2-fg-placeholder"
      />
    </label>
  );
}

/** 부스 줄(이름, "A홀 A13", 하트). 오른쪽은 동작 글자(9-02 "여기예요") 또는 화살표. */
export function BoothRows({
  booths,
  hallOf,
  records,
  action,
  onPick,
}: {
  booths: BoothListItem[];
  hallOf: (b: BoothListItem) => string | undefined;
  records: Record<string, BoothRecord>;
  action?: string;
  onPick: (b: BoothListItem) => void;
}) {
  return (
    <ul className="flex flex-col">
      {booths.map((b) => (
        <li key={b.id}>
          <button
            type="button"
            onClick={() => onPick(b)}
            className="flex w-full items-center gap-v2-x3 py-v2-x3 text-left active:bg-v2-bg-transparent-pressed"
          >
            {isHearted(records[b.id]) && (
              <Heart
                aria-hidden
                className="size-[var(--roam-v2-icon-size-md)] shrink-0 fill-v2-fg-brand text-v2-fg-brand"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 font-v2-medium">
              <span className="truncate text-v2-t5 text-v2-fg-neutral">{b.name}</span>
              <span className="text-v2-t3 text-v2-fg-neutral-muted">
                {label.hallNumber(hallOf(b), b.code)}
              </span>
            </span>
            {action ? (
              <span className="shrink-0 text-v2-t4 font-v2-bold text-v2-fg-brand">{action}</span>
            ) : (
              <ChevronRight
                aria-hidden
                className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral-muted"
              />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
