"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, CircleX } from "lucide-react";
import { FairRow, FairSection } from "@/components/home/fair-row";
import { VerdictAskCard } from "@/components/home/verdict-ask";
import { useEndedEntry } from "@/components/home/use-ended-entry";
import { HeartedBrandCard, useHeartedBrands } from "@/components/home/hearted-brands";
import { homeOthers, type FairEntry, type FairGroups } from "@/lib/exhibition/fair-groups";
import { homeCopy } from "@/lib/copy/home";
import { AB, abVariant } from "@/lib/ab/variant";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { MeFair } from "@/lib/me/view";

/**
 * UI 20-01 홈 본문(11-20 Ted). 위에서부터:
 * 1. 열린 곳이 없으면 안내 카드(2-07).
 * 2. 끝난 박람회 평가 묻기 M3(11-08). 끝나고 14일 안, 평가 없이 다녀온 곳이 있을 때 한 장.
 * 3. H-B "다녀오신 박람회"(11-01). A/B로 절반만 본다(H-C는 박람회 전체에서만 들어간다, 11-02).
 *    M3이 떠 있으면 같은 말을 두 번 하지 않게 내린다.
 * 4. 하트 남긴 브랜드가 나오는 박람회(2-05). 로그인하고 브랜드 하트가 있을 때만.
 * 5. 지금 열려 있어요, 곧 열려요(전부), 끝났어요. 그 밖은 세 곳 정도: 열린 곳 먼저, 남는 자리는 최근에 끝난 곳.
 * 6. "박람회 전체 보기" → 20-02(시트가 아니라 밀어 여는 화면).
 * 매거진(2-02~2-04)은 나중으로 미룬 결정이라 자리를 두지 않는다. 머리의 검색 아이콘은 정해진 흐름이 없어 두지 않는다.
 */
export function HomeBody({
  groups,
  fairs,
  today,
  failed,
  signedIn,
}: {
  groups: FairGroups;
  fairs: MeFair[];
  today: string;
  failed: boolean;
  signedIn: boolean;
}) {
  const others = homeOthers(groups);
  const { ask, hideAsk, lastWeek } = useEndedEntry(fairs, today);
  const [variant, setVariant] = useState<"h_b" | "h_c" | null>(null);
  useEffect(() => {
    // 브라우저에서만 고른다(서버 렌더는 기기를 모른다).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariant(abVariant(AB.endedFairEntry.key, AB.endedFairEntry.variants));
  }, []);
  const hearted = useHeartedBrands(signedIn);
  const heartLine = (slug: string) => {
    const names = hearted.bySlug[slug];
    return names?.length ? homeCopy.heartedBrandLine(names.slice(0, 2).join(", ")) : undefined;
  };
  // 2-05 카드: 브랜드가 나오는 첫 박람회(열린 곳, 곧 열리는 곳 순). 열 수 있는 곳만.
  const heartedFair = [...groups.open, ...groups.upcoming].find(
    (e) => e.openable && hearted.bySlug[e.fair.slug]?.length,
  );
  const showLastWeek = variant === "h_b" && !ask && lastWeek.length > 0;
  const entries = useMemo(
    () => new Map([...groups.open, ...groups.upcoming, ...groups.ended].map((e) => [e.fair.slug, e])),
    [groups],
  );

  useEffect(() => {
    track("screen_view", {
      screen: groups.open.length ? SCREEN.home : SCREEN.homeNoOpen,
      props: {
        fair_groups: [groups.open, groups.upcoming, groups.ended].filter((g) => g.length).length,
        count: groups.upcoming.filter((e) => !e.openable).length,
      },
    });
  }, [groups]);

  useEffect(() => {
    if (!showLastWeek) return;
    for (const g of lastWeek)
      track("ended_fair_entry_shown", {
        screen: SCREEN.endedHome,
        exhibitionSlug: g.fair.slug,
        props: { variant: "h_b" },
      });
  }, [showLastWeek, lastWeek]);

  const row = (e: FairEntry, onOpen?: () => void) => (
    <li key={e.fair.id}>
      <FairRow entry={e} today={today} heartLine={heartLine(e.fair.slug)} onOpen={onOpen} />
    </li>
  );

  if (failed)
    return (
      <Notice icon="x" title={homeCopy.homeFailed} body={homeCopy.homeFailedBody} />
    );

  return (
    <div className="flex flex-col gap-v2-x6">
      {groups.open.length === 0 && (
        <Notice
          icon="calendar"
          title={homeCopy.noOpenFairsTitle}
          body={groups.upcoming.length ? homeCopy.noOpenFairsBody : homeCopy.noFairsAtAll}
        />
      )}
      {ask && (
        <div className="px-v2-x4">
          <VerdictAskCard group={ask} screen={SCREEN.homeVerdict} onHide={hideAsk} />
        </div>
      )}
      <FairSection title={homeCopy.visitedLastWeek} empty={!showLastWeek}>
        {lastWeek.map((g) => {
          const e = entries.get(g.fair.slug);
          return e
            ? row(e, () =>
                track("ended_fair_entry_tap", {
                  screen: SCREEN.endedHome,
                  exhibitionSlug: g.fair.slug,
                  props: { variant: "h_b" },
                }),
              )
            : null;
        })}
      </FairSection>
      {heartedFair && (
        <div className="px-v2-x4">
          <HeartedBrandCard
            entry={heartedFair}
            names={hearted.bySlug[heartedFair.fair.slug] ?? []}
            today={today}
          />
        </div>
      )}
      <FairSection title={homeCopy.openNow} empty={others.open.length === 0}>
        {others.open.map((e) => row(e))}
      </FairSection>
      <FairSection title={homeCopy.comingSoon} empty={groups.upcoming.length === 0}>
        {groups.upcoming.map((e) => row(e))}
      </FairSection>
      <FairSection title={homeCopy.ended} empty={others.ended.length === 0}>
        {others.ended.map((e) => row(e))}
      </FairSection>
      {entries.size > 0 && (
        <Link
          href="/fairs"
          className="flex min-h-v2-x11 items-center self-start px-v2-x4 text-v2-t4 font-v2-medium text-v2-fg-brand"
        >
          {homeCopy.allFairs}
        </Link>
      )}
    </div>
  );
}

function Notice({ icon, title, body }: { icon: "calendar" | "x"; title: string; body?: string }) {
  const Icon = icon === "calendar" ? CalendarDays : CircleX;
  return (
    <div className="mx-v2-x4 flex items-start gap-v2-x3 rounded-v2-r4 bg-v2-bg-neutral-weak p-v2-x4">
      <Icon aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral-muted" />
      <div className="flex flex-col gap-v2-x0-5 font-v2-medium">
        <p className="text-v2-t4 text-v2-fg-neutral">{title}</p>
        {body && <p className="text-v2-t3 text-v2-fg-neutral-muted">{body}</p>}
      </div>
    </div>
  );
}
