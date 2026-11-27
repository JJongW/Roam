"use client";

import { useEffect } from "react";
import Link from "next/link";
import { CalendarDays, Footprints, Heart, Settings } from "lucide-react";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { BackButton } from "@/components/v2/back-button";
import { Snackbar, useQueuedSnackbar } from "@/components/v2/snackbar";
import { MiniMap } from "@/components/booth-v2/mini-map";
import { InboxBell } from "@/components/inbox/inbox-bell";
import { useAuthStore } from "@/lib/stores/auth";
import { FLOORPLANS } from "@/lib/floorplans";
import { dayKo, label, system } from "@/lib/copy/v1";
import { homeCopy } from "@/lib/copy/home";
import { SCREEN, track } from "@/lib/analytics/app-track";
import {
  fairDays,
  groupWhen,
  nextFair,
  phaseOf,
  romiLine,
  type FairGroup,
  type MeFair,
} from "@/lib/me/view";
import { useMyRecords } from "./use-my-records";
import { VerdictAskCard } from "@/components/home/verdict-ask";
import { useEndedEntry } from "@/components/home/use-ended-entry";
import {
  Card,
  FairGroupHead,
  HeartRow,
  InfoRow,
  MePage,
  SectionHead,
  useHeartRemove,
} from "./me-ui";

/**
 * UI 14 마이페이지 첫 화면. 14-01(로그인 전), 14-03과 14-04(로그인 뒤), 14-06(하트가 없을 때).
 * - 하단 탭 바(14 공통)는 iOS 시스템 탭 자리다. 웹에는 탭 바가 없어 홈 머리의 사람 아이콘으로 들어오고 머리의 뒤로로 나간다.
 * - 맨 위 박람회 카드의 넘김 점(여러 박람회 넘기기)은 아직 없다. 다음 박람회 한 장만 보인다.
 */
export function MyPage({ fairs, today }: { fairs: MeFair[]; today: string }) {
  const user = useAuthStore((s) => s.user);
  const authReady = useAuthStore((s) => s.ready);
  const { loading, hearts, visited, heartCount, firstVisit } = useMyRecords(fairs, today);
  const { snack, close, remove, show } = useHeartRemove(SCREEN.myPage);
  // 15-10 로그아웃하고 돌아오면 "로그아웃했어요"를 이 화면 스낵바로 띄운다.
  useQueuedSnackbar(show);
  // 11-10 M6: 끝난 박람회 평가 묻기. 홈 M3과 같은 카드, 같은 "나중에 할게요" 기억.
  const { ask, hideAsk } = useEndedEntry(fairs, today);

  const next = nextFair(fairs, today);
  const nextGroup = next ? hearts.find((g) => g.fair.id === next.id) : undefined;
  const activeGroups = hearts.filter((g) => g.phase !== "ended");
  const heartFairIds = new Set(activeGroups.map((g) => g.fair.id));
  const upcoming = fairs
    .filter((f) => phaseOf(f, today) !== "ended" && !heartFairIds.has(f.id))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const empty = heartCount === 0;

  const ready = !loading && authReady;
  useEffect(() => {
    if (!ready) return;
    track("screen_view", {
      screen: empty ? SCREEN.heartEmpty : SCREEN.myPage,
      props: { signed_in: !!user, heart_count: heartCount },
    });
    // 열렸을 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <MePage snack={<Snackbar state={snack} onClose={close} className="w-full" />}>
      {/* 홈으로 돌아가는 길. Figma 14 공통은 iOS 시스템 하단 탭(홈, 마이페이지)인데 웹에는 탭 바가 없고 홈 머리의
          사람 아이콘으로 들어온다. 홈 화면에 앱으로 추가하면(manifest standalone) 브라우저 뒤로도 없어 막다른 화면이
          됐다. 하위 화면과 같은 뒤로 버튼(아이콘 왼쪽 16)을 두고, 바로 들어왔으면 홈으로 간다. */}
      <header className="flex h-v2-x11 items-center pl-v2-x1-5 pr-v2-x1-5 pt-safe">
        <BackButton fallbackHref="/" />
        <h1 className="min-w-0 flex-1 truncate text-v2-t7 font-v2-bold tracking-v2-card-title">
          {user?.nickname ?? system.browsing}
        </h1>
        {user && <InboxBell />}
        <Link
          href="/me/settings"
          aria-label={label.settings}
          className="flex size-v2-x11 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
        >
          <Settings aria-hidden className="size-[var(--roam-v2-icon-size-lg)]" />
        </Link>
      </header>

      {!ready ? (
        <p className="px-v2-x4 py-v2-x6 text-v2-t4 text-v2-fg-neutral-muted">{system.meLoading}</p>
      ) : (
        <>
          {/* UI/로미 동행 줄(3003:4515). 사실 두 줄. */}
          <div className="flex items-start gap-v2-x3 px-v2-x4 py-v2-x2">
            <RomiAvatar size="md" />
            <div className="flex min-w-0 flex-1 flex-col items-start gap-v2-x3">
              <p className="whitespace-pre-line text-v2-t5 font-v2-medium">
                {romiLine({
                  next,
                  today,
                  heartsInNext: nextGroup?.rows.length ?? 0,
                  heartCount,
                  signedIn: !!user,
                })}
              </p>
              {!user && (
                <button
                  type="button"
                  // 지금 화면 위에 로그인 시트(5-04)를 띄운다(11-20 Ted, 페이지 이동 대신).
                  onClick={() => useAuthStore.getState().openLogin("my_page")}
                  className="flex h-v2-x10 items-center rounded-v2-r2 border border-v2-stroke-neutral-weak bg-v2-bg-layer-floating px-v2-x4 text-v2-t4 font-v2-bold active:bg-v2-bg-neutral-weak"
                >
                  {label.login}
                </button>
              )}
            </div>
          </div>

          {ask && (
            <div className="px-v2-x4 pb-v2-x3">
              <VerdictAskCard group={ask} screen={SCREEN.myVerdict} onHide={hideAsk} />
            </div>
          )}

          {empty ? (
            <EmptyHearts next={next} today={today} />
          ) : (
            nextGroup && <NextFairCard group={nextGroup} />
          )}

          {!empty && (
            <>
              <SectionHead
                title={label.heartedPlaces}
                action={{ label: label.seeAll, href: "/me/hearts" }}
              />
              {activeGroups.length > 0 && (
                <div className="flex flex-col gap-v2-x3 px-v2-x4">
                  {activeGroups.map((g) => (
                    <Card key={g.fair.id}>
                      <FairGroupHead
                        name={g.fair.name}
                        when={groupWhen(g)}
                        href={`/me/hearts/${g.fair.slug}`}
                      />
                      <ul>
                        {g.rows.map((r) => (
                          <HeartRow
                            key={r.boothId}
                            name={r.name}
                            trailing={r.code}
                            href={`/booths/${r.boothId}`}
                            onRemove={() => remove(r, g.fair.slug)}
                          />
                        ))}
                      </ul>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}

          {upcoming.length > 0 && (
            <>
              <SectionHead title={label.upcomingFairs} />
              <div className="px-v2-x4">
                <Card>
                  {upcoming.map((f) => (
                    // 지도를 열 수 없는 박람회(UI 20)는 홈 줄처럼 "진행 예정"만 두고 누르지 않는다.
                    <InfoRow
                      key={f.id}
                      icon={CalendarDays}
                      title={f.name}
                      sub={`${dayKo(f.startDate)}, ${f.venue}`}
                      value={f.openable === false ? homeCopy.notOpen : label.seeMap}
                      href={f.openable === false ? undefined : `/exhibitions/${f.slug}/map`}
                    />
                  ))}
                </Card>
              </div>
            </>
          )}

          {visited.length > 0 && (
            <>
              <SectionHead title={label.visited} />
              <div className="px-v2-x4">
                <Card>
                  {visited.map((g) => {
                    const first = firstVisit(g.fair.id);
                    return (
                      <InfoRow
                        key={g.fair.id}
                        icon={Footprints}
                        title={g.fair.name}
                        sub={first ? `${dayKo(first)}, ${g.fair.venue}` : g.fair.venue}
                        value={label.placesStat(g.rows.length)}
                        href={`/visited#${g.fair.slug}`}
                      />
                    );
                  })}
                </Card>
              </div>
            </>
          )}

          {(!empty || visited.length > 0) && (
            <p className="whitespace-pre-line px-v2-x4 pt-v2-x3 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
              {system.heartsApart}
            </p>
          )}
        </>
      )}
    </MePage>
  );
}

/** 14-01, 14-03 맨 위 다음 박람회 카드. 하트 남긴 칸만 켜진 작은 지도, 이름과 때, 하트 수 알약. 누르면 14-05. */
function NextFairCard({ group }: { group: FairGroup }) {
  const { fair, rows } = group;
  const fp = FLOORPLANS[fair.slug];
  const codes = new Set(rows.map((r) => r.code).filter((c): c is string => !!c));
  return (
    <div className="px-v2-x4 pt-v2-x2">
      <Link
        href={`/me/hearts/${fair.slug}`}
        className="flex flex-col gap-v2-x3 rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4 active:bg-v2-bg-neutral-weak"
      >
        {fp && <MiniMap floorplan={fp} codes={codes} mode="heart" />}
        <div className="flex items-center gap-v2-x3">
          <div className="flex min-w-0 flex-1 flex-col gap-v2-x1">
            <p className="text-v2-t7 font-v2-bold tracking-v2-card-title">{fair.name}</p>
            <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
              {system.fairPeriod(dayKo(fair.startDate), fairDays(fair), fair.venue)}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-v2-x1 rounded-v2-full bg-v2-bg-brand-weak py-v2-x1-5 pl-v2-x2-5 pr-v2-x3 text-v2-t4 font-v2-bold text-v2-fg-brand">
            <Heart aria-hidden fill="currentColor" className="size-[var(--roam-v2-icon-size-sm)]" />
            {label.heartsPill(rows.length)}
          </span>
        </div>
      </Link>
    </div>
  );
}

/** 14-06 하트가 없을 때. 예시 지도와 세 단계 안내, 지금 열린(없으면 다음) 박람회 지도 보기. */
function EmptyHearts({ next, today }: { next: MeFair | null; today: string }) {
  // Figma는 지금 열린 박람회로 간다. 열린 곳이 없으면 버튼을 두지 않는다(지도가 아직 없는 박람회는 열 수 없다, 11-20).
  const open = next && phaseOf(next, today) === "ongoing" ? next : null;
  // 예시 칸: 3줄 5칸, Figma 14-06처럼 몇 칸에만 하트.
  const on = new Set([1, 8, 12]);
  return (
    <div className="flex flex-col gap-v2-x4 px-v2-x4 pt-v2-x2">
      <div className="flex flex-col gap-v2-x3 rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4">
        <div aria-hidden className="grid grid-cols-5 gap-v2-x1-5 rounded-v2-r1 border-2 border-v2-stroke-neutral-weak bg-v2-bg-layer-default p-v2-x3">
          {Array.from({ length: 15 }, (_, i) => (
            <span
              key={i}
              className={
                on.has(i)
                  ? "relative h-v2-x8 rounded-v2-r1 border border-v2-stroke-brand-solid bg-v2-bg-brand-weak"
                  : "h-v2-x8 rounded-v2-r1 border border-v2-stroke-neutral-weak bg-v2-map-booth"
              }
            >
              {on.has(i) && (
                <Heart
                  fill="currentColor"
                  className="absolute bottom-v2-x0-5 right-v2-x0-5 size-v2-x3 text-v2-fg-brand"
                />
              )}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-v2-x3">
          <div className="flex min-w-0 flex-1 flex-col gap-v2-x1">
            <p className="text-v2-t7 font-v2-bold tracking-v2-card-title">{system.exampleHeartTitle}</p>
            <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{system.exampleHeartBody}</p>
          </div>
          <span className="shrink-0 rounded-v2-r1 bg-v2-bg-neutral-weak px-v2-x2 py-v2-x1 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
            {label.example}
          </span>
        </div>
        <ol className="flex flex-wrap gap-v2-x3 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
          {[label.step1, label.step2, label.step3].map((s, i) => (
            <li key={s} className="flex items-center gap-v2-x1">
              <span className="flex size-v2-x4 items-center justify-center rounded-v2-full border border-v2-stroke-neutral-weak text-v2-t1">
                {i + 1}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>
      {open && (
        <Link
          href={`/exhibitions/${open.slug}/map`}
          className="flex h-v2-x13 items-center justify-center rounded-v2-r3 bg-v2-bg-brand-solid text-v2-t5 font-v2-bold text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
        >
          {label.seeMap}
        </Link>
      )}
    </div>
  );
}
