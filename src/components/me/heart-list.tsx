"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { Snackbar } from "@/components/v2/snackbar";
import { MiniMap } from "@/components/booth-v2/mini-map";
import { useAuthStore } from "@/lib/stores/auth";
import { FLOORPLANS } from "@/lib/floorplans";
import { dayKo, label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { fairDays, groupWhen, type FairGroup, type MeFair } from "@/lib/me/view";
import { useMyRecords } from "./use-my-records";
import { Card, FairGroupHead, HeartRow, MePage, PageTitle, SectionHead, useHeartRemove } from "./me-ui";

const WEEKDAY = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];

/**
 * 14-02(로그인 전), 14-07과 14-08(로그인 뒤): 하트 남긴 곳 전체. 앞날 박람회는 펼치고 끝난 박람회는 접는다(11-16).
 * 14-09: 하트를 누르면 확인 없이 빠지고 스낵바로 되돌린다.
 */
export function HeartList({ fairs, today }: { fairs: MeFair[]; today: string }) {
  const signedIn = useAuthStore((s) => !!s.user);
  const { loading, hearts } = useMyRecords(fairs, today, { withCategory: true });
  const { snack, close, remove } = useHeartRemove(SCREEN.heartList);
  const [openEnded, setOpenEnded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (loading) return;
    track("heart_list_view", {
      screen: SCREEN.heartList,
      props: { fair_count: hearts.length, booth_count: hearts.reduce((n, g) => n + g.rows.length, 0) },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  const toggle = (id: string) =>
    setOpenEnded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <MePage back="/me">
      <PageTitle
        title={label.heartedPlaces}
        sub={signedIn ? system.heartListNoteAccount : system.heartListNote}
      />
      {loading ? (
        <p className="px-v2-x4 py-v2-x6 text-v2-t4 text-v2-fg-neutral-muted">{system.meLoading}</p>
      ) : hearts.length === 0 ? (
        <p className="px-v2-x4 py-v2-x6 text-v2-t4 text-v2-fg-neutral-muted">{system.emptyHearts}</p>
      ) : (
        <div className="flex flex-col gap-v2-x3 px-v2-x4 pt-v2-x2">
          {hearts.map((g) => {
            const ended = g.phase === "ended";
            const open = !ended || openEnded.has(g.fair.id);
            return (
              <Card key={g.fair.id}>
                <FairGroupHead
                  name={g.fair.name}
                  when={ended ? label.ended : groupWhen(g)}
                  href={ended ? undefined : `/me/hearts/${g.fair.slug}`}
                  toggle={ended ? { open, onToggle: () => toggle(g.fair.id) } : undefined}
                />
                {open && (
                  <ul>
                    {g.rows.map((r) => (
                      <HeartRow
                        key={r.boothId}
                        name={r.name}
                        sub={r.category}
                        trailing={r.code}
                        href={`/booths/${r.boothId}`}
                        onRemove={() => remove(r, g.fair.slug)}
                      />
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
      <SnackSlot snack={snack} close={close} />
    </MePage>
  );
}

/**
 * 14-05 맨 위 카드를 누르면 그 박람회의 하트 남긴 곳만. 로미가 때와 장소를 말하고, 하트 칸만 켜진 지도,
 * 하트 줄, 맨 아래 "지도 보기"(그 박람회 지도. 하트는 지도에 늘 켜져 있다).
 */
export function FairHeartList({
  fair,
  fairs,
  today,
}: {
  fair: MeFair;
  fairs: MeFair[];
  today: string;
}) {
  const { loading, hearts } = useMyRecords(fairs, today, { withCategory: true });
  const { snack, close, remove } = useHeartRemove(SCREEN.heartFair);
  const group: FairGroup | undefined = hearts.find((g) => g.fair.id === fair.id);
  const fp = FLOORPLANS[fair.slug];
  const codes = new Set((group?.rows ?? []).map((r) => r.code).filter((c): c is string => !!c));
  const start = new Date(fair.startDate);
  const when = `${dayKo(fair.startDate)} ${WEEKDAY[start.getDay()]}${
    fairDays(fair) > 1 ? `부터 ${fairDays(fair)}일간` : ""
  }`;

  useEffect(() => {
    if (loading) return;
    track("screen_view", {
      screen: SCREEN.heartFair,
      exhibitionSlug: fair.slug,
      props: { booth_count: group?.rows.length ?? 0 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <MePage
      back="/me"
      bottom={
        <Link
          href={`/exhibitions/${fair.slug}/map`}
          className="flex h-v2-x13 items-center justify-center rounded-v2-r3 bg-v2-bg-brand-solid text-v2-t5 font-v2-bold text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
        >
          {label.seeMap}
        </Link>
      }
    >
      <PageTitle title={fair.name} />
      <div className="flex items-start gap-v2-x3 px-v2-x4 py-v2-x2">
        <RomiAvatar size="md" />
        <p className="min-w-0 flex-1 text-v2-t5 font-v2-medium">
          {loading || (fp && codes.size > 0)
            ? system.fairHeartsOn(when, fair.venue)
            : system.fairWhere(when, fair.venue)}
        </p>
      </div>
      {loading ? (
        <p className="px-v2-x4 py-v2-x6 text-v2-t4 text-v2-fg-neutral-muted">{system.meLoading}</p>
      ) : (
        <>
          {fp && codes.size > 0 && (
            <div className="px-v2-x4 pt-v2-x2">
              <MiniMap floorplan={fp} codes={codes} mode="heart" />
            </div>
          )}
          <SectionHead title={label.heartedPlaces} />
          {group ? (
            <div className="px-v2-x4">
              <Card>
                <ul>
                  {group.rows.map((r) => (
                    <HeartRow
                      key={r.boothId}
                      name={r.name}
                      sub={r.category}
                      trailing={r.code}
                      href={`/booths/${r.boothId}`}
                      onRemove={() => remove(r, fair.slug)}
                    />
                  ))}
                </ul>
              </Card>
              <p className="pt-v2-x3 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                {system.heartListNoteAccount}
              </p>
            </div>
          ) : (
            <p className="px-v2-x4 text-v2-t4 text-v2-fg-neutral-muted">{system.emptyHearts}</p>
          )}
        </>
      )}
      <SnackSlot snack={snack} close={close} bottomOffset />
    </MePage>
  );
}

function SnackSlot({
  snack,
  close,
  bottomOffset,
}: {
  snack: Parameters<typeof Snackbar>[0]["state"];
  close: () => void;
  /** 아래 붙은 버튼 위로 띄운다 */
  bottomOffset?: boolean;
}) {
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-30 mx-auto flex w-full max-w-[var(--roam-v2-size-content-max-width)] px-v2-x4 pb-safe ${
        bottomOffset ? "bottom-v2-x22" : "bottom-0"
      }`}
    >
      <Snackbar state={snack} onClose={close} className="mb-v2-x4 w-full" />
    </div>
  );
}
