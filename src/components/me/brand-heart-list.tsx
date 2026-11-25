"use client";

import { useCallback, useEffect, useState } from "react";
import { Snackbar, type SnackbarState } from "@/components/v2/snackbar";
import { api } from "@/lib/api/client";
import { dayKo, label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import {
  loadBrandHearts,
  pushBrandHeart,
  pushBrandHeartRemoval,
  restoreBrandHeart,
  setBrandHeart,
  type BrandHeartRemoval,
} from "@/lib/stores/brand-hearts";
import type { BrandHeartView } from "@/lib/brands/hearts";
import { Card, HeartRow, MePage, PageTitle } from "./me-ui";

/** 스낵바 key(같은 문구가 다시 떠도 타이머가 새로 돌게). 누를 때만 부른다. */
const stamp = () => Date.now();

/**
 * 14-10 하트 남긴 브랜드. 설정 15-01 "하트 남긴 브랜드"에서 들어온다. 로그인한 분만(proxy가 /login으로 보낸다).
 * - 원천: GET /api/me/brand-hearts(브랜드 이름과 다가오는 참가). 다가오는 참가가 있으면 "곧 박람회에 나와요",
 *   없으면 "다음 일정은 아직 몰라요".
 * - Figma의 "서울디자인페스티벌 2025에 나왔어요"(지난 참가)는 이 API가 주지 않아 아직 비운다.
 * - 하트를 누르면 확인 없이 빠지고 스낵바로 되돌린다(19-A4와 같은 말).
 * - 빼면 서버가 그 브랜드 부스 하트도 같이 끈다(2026-11-24 Ted). 되돌리면 그 부스 하트도 다시 켠다.
 */
export function BrandHeartList() {
  const [views, setViews] = useState<BrandHeartView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const close = useCallback(() => setSnack(null), []);

  const load = useCallback(() => {
    api
      .get<{ data: BrandHeartView[] }>("/api/me/brand-hearts")
      .then((r) => {
        setViews(r.data);
        setFailed(false);
        track("heart_brand_view", {
          screen: SCREEN.heartBrands,
          props: {
            count: r.data.length,
            upcoming_count: r.data.filter((v) => v.upcoming.length > 0).length,
          },
        });
      })
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    loadBrandHearts();
    load();
  }, [load]);

  const markRemoved = (id: string, on: boolean) =>
    setRemoved((s) => {
      const n = new Set(s);
      if (on) n.delete(id);
      else n.add(id);
      return n;
    });

  const failSave = () => setSnack({ key: stamp(), message: system.brandHeartSaveFailed });

  const remove = (v: BrandHeartView) => {
    if (!setBrandHeart(v.exhibitorId, false)) return failSave();
    // 빼기 응답에 서버가 끈 부스 하트가 실려 온다. 되돌리기가 그 응답을 기다려 같은 부스를 다시 켠다.
    const pushed: Promise<BrandHeartRemoval | null> = pushBrandHeartRemoval(v.exhibitorId);
    markRemoved(v.exhibitorId, false);
    track("brand_heart_remove", { screen: SCREEN.heartBrands, props: { exhibitorId: v.exhibitorId } });
    setSnack({
      key: stamp(),
      message: system.brandHeartRemoved(v.name),
      actionLabel: label.undo,
      onAction: () => {
        markRemoved(v.exhibitorId, true);
        void (async () => {
          const removal = await pushed;
          // 빼기를 못 올렸으면(오프라인) 서버 부스 하트는 그대로다. 기기 브랜드 하트만 다시 켠다.
          let ok: boolean;
          if (removal) ok = await restoreBrandHeart(v.exhibitorId, removal);
          else {
            ok = setBrandHeart(v.exhibitorId, true);
            if (ok) void pushBrandHeart(v.exhibitorId);
          }
          if (!ok) {
            markRemoved(v.exhibitorId, false);
            failSave();
            return;
          }
          track("brand_heart_undo", { screen: SCREEN.heartBrands, props: { exhibitorId: v.exhibitorId } });
        })();
      },
    });
  };

  const shown = (views ?? []).filter((v) => !removed.has(v.exhibitorId));
  const soon = shown.filter((v) => v.upcoming.length > 0);
  const unknown = shown.filter((v) => v.upcoming.length === 0);

  const rows = (list: BrandHeartView[]) => (
    <Card>
      <ul>
        {list.map((v) => {
          const u = v.upcoming[0];
          return (
            <HeartRow
              key={v.exhibitorId}
              name={v.name}
              sub={u ? system.brandUpcoming(u.exhibition.name, dayKo(u.exhibition.startDate)) : undefined}
              href={u?.booth ? `/booths/${u.booth.id}` : undefined}
              removeLabel={label.brandHeartRemove}
              onRemove={() => remove(v)}
            />
          );
        })}
      </ul>
    </Card>
  );

  return (
    <MePage back="/me/settings" snack={<Snackbar state={snack} onClose={close} className="w-full" />}>
      <PageTitle title={label.heartedBrands} />
      {failed ? (
        <div className="flex flex-col items-start gap-v2-x3 px-v2-x4 py-v2-x6">
          <p className="text-v2-t4 text-v2-fg-neutral-muted">{system.brandHeartsFailed}</p>
          <button
            type="button"
            onClick={load}
            className="flex h-v2-x10 items-center rounded-v2-r2 border border-v2-stroke-neutral-weak px-v2-x4 text-v2-t4 font-v2-bold"
          >
            {label.retry}
          </button>
        </div>
      ) : views === null ? (
        <p className="px-v2-x4 py-v2-x6 text-v2-t4 text-v2-fg-neutral-muted">{system.brandHeartsLoading}</p>
      ) : shown.length === 0 ? (
        <p className="px-v2-x4 py-v2-x6 text-v2-t4 text-v2-fg-neutral-muted">{system.brandHeartsEmpty}</p>
      ) : (
        <div className="flex flex-col px-v2-x4">
          {soon.length > 0 && (
            <>
              <p className="pb-v2-x2 pt-v2-x4 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                {label.upcomingBrands}
              </p>
              {rows(soon)}
            </>
          )}
          {unknown.length > 0 && (
            <>
              <p className="pb-v2-x2 pt-v2-x4 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                {label.unknownSchedule}
              </p>
              {rows(unknown)}
            </>
          )}
          <p className="pt-v2-x3 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
            {system.heartListNoteAccount}
          </p>
        </div>
      )}
    </MePage>
  );
}
