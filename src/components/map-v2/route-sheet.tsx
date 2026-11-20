"use client";

import { useEffect, useState } from "react";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import {
  BoothRows,
  matchBooths,
  SearchField,
} from "@/components/map-v2/romi-sheet";
import { heartedByHall } from "@/lib/route/guide";
import { isHearted, type BoothRecord } from "@/lib/stores/visit";
import { label, romi } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { Floorplan } from "@/lib/floorplans";
import type { BoothListItem } from "@/lib/types";

/**
 * UI 9-01 어디로 가실까요(하트 남긴 곳 홀별, 찾기), 9-02 근처에 어떤 부스가 보이세요(근처 부스 이름).
 * 위치는 묻기만 한다. 추적하지 않는다(11-11). "잘 모르겠어요"면 가까운 출입구에서 그린다.
 * 단계가 바뀌면 찾기 칸을 비우도록 부르는 쪽이 `key={step}`을 준다.
 */
export function RouteSheet({
  step,
  booths,
  records,
  floorplan,
  hallOf,
  targetId,
  exhibitionSlug,
  onPickTarget,
  onPickStart,
  onClose,
}: {
  step: "pickTarget" | "askStart";
  booths: BoothListItem[];
  records: Record<string, BoothRecord>;
  floorplan?: Floorplan;
  hallOf: (b: BoothListItem) => string | undefined;
  targetId?: string;
  exhibitionSlug: string;
  onPickTarget: (id: string) => void;
  /** null은 "잘 모르겠어요". */
  onPickStart: (id: string | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    track("screen_view", {
      screen: step === "pickTarget" ? SCREEN.routeTarget : SCREEN.routeNearby,
      exhibitionSlug,
      boothId: targetId,
    });
  }, [step, exhibitionSlug, targetId]);
  const typed = query.trim().length > 0;
  const placed = booths.filter((b) => b.kind !== "facility");

  if (step === "pickTarget") {
    const hearted = placed.filter((b) => isHearted(records[b.id]));
    const byId = new Map(placed.map((b) => [b.id, b]));
    const groups = heartedByHall(
      floorplan,
      hearted.map((b) => ({ id: b.id, code: b.code, name: b.name })),
    );
    return (
      <BottomSheet ariaLabel={romi.routeWhereTo} onClose={onClose}>
        <Header title={romi.routeWhereTo} />
        <SearchField value={query} onChange={setQuery} placeholder={label.searchPlaceholder} />
        {typed ? (
          <BoothRows
            booths={matchBooths(placed, query).slice(0, 8)}
            hallOf={hallOf}
            records={records}
            onPick={(b) => onPickTarget(b.id)}
          />
        ) : (
          groups.length > 0 && (
            <div className="flex flex-col gap-v2-x1">
              <h3 className="text-v2-t3 font-v2-bold text-v2-fg-neutral-muted">
                {label.heartedPlaces}
              </h3>
              {groups.map((g) => (
                <div key={g.hall ?? "-"} className="flex flex-col">
                  {groups.length > 1 && g.hall && (
                    <p className="pt-v2-x2 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">{g.hall}</p>
                  )}
                  <BoothRows
                    booths={g.booths.map((x) => byId.get(x.id)!).filter(Boolean)}
                    hallOf={hallOf}
                    records={records}
                    onPick={(b) => onPickTarget(b.id)}
                  />
                </div>
              ))}
            </div>
          )
        )}
      </BottomSheet>
    );
  }

  const found = matchBooths(placed, query)
    .filter((b) => b.id !== targetId)
    .slice(0, 6);
  return (
    <BottomSheet ariaLabel={romi.routeNearbyAsk} onClose={onClose}>
      <Header title={romi.routeNearbyAsk} />
      <SearchField value={query} onChange={setQuery} placeholder={label.nearbyBoothName} />
      <BoothRows
        booths={found}
        hallOf={hallOf}
        records={records}
        action={label.here}
        onPick={(b) => onPickStart(b.id)}
      />
      <button
        type="button"
        onClick={() => onPickStart(null)}
        className="flex min-h-v2-x11 w-full items-center justify-center text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
      >
        {label.dontKnow}
      </button>
    </BottomSheet>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div className="flex items-start gap-v2-x3">
      <RomiAvatar size="md" />
      <h2 className="pt-v2-x1 text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
        {title}
      </h2>
    </div>
  );
}
