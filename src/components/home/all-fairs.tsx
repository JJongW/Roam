"use client";

import { useEffect, useState } from "react";
import { MePage, PageTitle } from "@/components/me/me-ui";
import { FairRow, FairSection } from "@/components/home/fair-row";
import { useMyRecords } from "@/components/me/use-my-records";
import type { FairEntry, FairGroups } from "@/lib/exhibition/fair-groups";
import { homeCopy } from "@/lib/copy/home";
import { AB, abVariant } from "@/lib/ab/variant";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { MeFair } from "@/lib/me/view";

/**
 * UI 20-02 박람회 전체(Figma 3230:21714). 시트가 아니라 밀어 여는 화면이다(11-20).
 * 지금 열려 있어요, 곧 열려요(흐린 진행 예정 포함), 끝났어요(최근에 끝난 순). 탭은 없다(11-03 탭은 버림).
 *
 * 끝난 박람회는 H-C(11-02)의 입구이기도 하다. 이 브라우저에 남기신 게(하트, 다녀왔어요) 있는 박람회를
 * "남기신 게 있는 박람회"로 위에, 나머지를 "그 밖의 지난 박람회"로 나눈다(11-03 묶음 이름). 남기신 게
 * 없으면 한 묶음 "끝났어요"로 둔다.
 */
export function AllFairs({
  groups,
  fairs,
  today,
}: {
  groups: FairGroups;
  fairs: MeFair[];
  today: string;
}) {
  const { loading, hearts, visited } = useMyRecords(fairs, today);
  const [variant, setVariant] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVariant(abVariant(AB.endedFairEntry.key, AB.endedFairEntry.variants));
    track("screen_view", { screen: SCREEN.fairsAll });
  }, []);

  const leftIds = new Set(
    loading ? [] : [...hearts, ...visited].map((g) => g.fair.id),
  );
  const withLeft = groups.ended.filter((e) => leftIds.has(e.fair.id));
  const other = groups.ended.filter((e) => !leftIds.has(e.fair.id));

  const endedRow = (e: FairEntry) => (
    <li key={e.fair.id}>
      <FairRow
        entry={e}
        today={today}
        onOpen={() =>
          track("ended_fair_entry_tap", {
            screen: SCREEN.fairsAll,
            exhibitionSlug: e.fair.slug,
            props: { variant: variant ?? "h_c", surface: "all_fairs", has_left: leftIds.has(e.fair.id) },
          })
        }
      />
    </li>
  );
  const row = (e: FairEntry) => (
    <li key={e.fair.id}>
      <FairRow entry={e} today={today} />
    </li>
  );

  return (
    <MePage back="/">
      <PageTitle title={homeCopy.fairsTitle} />
      <div className="flex flex-col gap-v2-x6 pt-v2-x2">
        <FairSection title={homeCopy.openNow} empty={groups.open.length === 0}>
          {groups.open.map(row)}
        </FairSection>
        <FairSection title={homeCopy.comingSoon} empty={groups.upcoming.length === 0}>
          {groups.upcoming.map(row)}
        </FairSection>
        {withLeft.length > 0 ? (
          <>
            <FairSection title={homeCopy.fairsWithLeft}>{withLeft.map(endedRow)}</FairSection>
            <FairSection title={homeCopy.fairsOther} empty={other.length === 0}>
              {other.map(endedRow)}
            </FairSection>
          </>
        ) : (
          <FairSection title={homeCopy.ended} empty={groups.ended.length === 0}>
            {groups.ended.map(endedRow)}
          </FairSection>
        )}
        {groups.open.length + groups.upcoming.length + groups.ended.length === 0 && (
          <p className="px-v2-x4 text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">
            {homeCopy.noFairsAtAll}
          </p>
        )}
      </div>
    </MePage>
  );
}
