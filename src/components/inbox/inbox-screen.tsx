"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Calendar, Heart, MessageCircle } from "lucide-react";
import { clsx } from "clsx";
import { BackButton } from "@/components/v2/back-button";
import { hasNavigatedInApp } from "@/components/common/nav-tracker";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { api } from "@/lib/api/client";
import {
  inboxHref,
  inboxIcon,
  inboxTimeLabel,
  isThisWeek,
  type InboxIcon,
  type InboxRow,
} from "@/lib/inbox/view";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";

const ICON: Record<InboxIcon, typeof Heart> = {
  brand: Heart,
  fair: Calendar,
  article: BookOpen,
  verdict: MessageCircle,
};

/**
 * UI 18-02 알림함, 18-03 빈 알림함(1-A, 11-19). 홈 종에서 들어온다. 로그인은 proxy가 맡는다.
 * - 최근 30일, 최신순(서버). "이번 주"와 "지난 알림"으로 묶는다. 안 읽은 줄은 진하게.
 * - 줄을 누르면 읽음으로 표시하고 그 알림이 가리키는 곳으로 간다(브랜드 알림은 부스 상세, 부스가 없으면 그 지도).
 *   간 곳에서 뒤로 가면 알림함이 아니라 홈이다(13-04).
 * - 알림 설정(13-09)은 웹에 없어 톱니를 두지 않는다. 웹은 브라우저 푸시를 보내지 않는다.
 */
export function InboxScreen() {
  const router = useRouter();
  const [rows, setRows] = useState<InboxRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = () =>
    api
      .get<{ items: InboxRow[]; unread: number }>("/api/me/notifications")
      .then((r) => {
        setRows(r.items);
        track("inbox_open", {
          screen: r.items.length ? SCREEN.inbox : SCREEN.inboxEmpty,
          props: { count: r.items.length, unread: r.unread },
        });
      })
      .catch(() => setFailed(true));
  // 한 번만(열렸을 때). 상태는 응답을 받은 뒤에만 바꾼다.
  useEffect(() => {
    void load();
  }, []);

  const groups = useMemo(() => {
    const now = new Date();
    const list = rows ?? [];
    return [
      { title: label.inboxThisWeek, rows: list.filter((r) => isThisWeek(r.createdAt, now)) },
      { title: label.inboxEarlier, rows: list.filter((r) => !isThisWeek(r.createdAt, now)) },
    ].filter((g) => g.rows.length > 0);
  }, [rows]);

  const open = (row: InboxRow) => {
    const href = inboxHref(row);
    track("inbox_item_open", {
      screen: SCREEN.inbox,
      exhibitionSlug: row.landing.slug,
      boothId: row.landing.boothId,
      props: { kind: row.landing.kind, unread: !row.readAt, has_target: !!href },
    });
    if (!row.readAt) {
      setRows((rs) =>
        (rs ?? []).map((r) => (r.id === row.id ? { ...r, readAt: new Date().toISOString() } : r)),
      );
      void api.post("/api/me/notifications/read", { ids: [row.id] }).catch(() => {});
    }
    if (!href) return;
    // 13-04: 알림으로 연 부스 상세에서 뒤로 가면 홈(20-01)이다(Figma 13-04 연결, iOS `land`가 홈 길을 비운다, Roam-ios #240).
    // 알림함은 홈 종에서만 들어오므로 알림함 자리를 바꿔 끼우면 뒤로 가기가 홈으로 간다.
    // 주소로 바로 들어와 앞 화면이 없으면 바꿔 끼우지 않는다(뒤로 가기가 앱 밖으로 나가지 않게).
    if (hasNavigatedInApp()) router.replace(href);
    else router.push(href);
  };

  return (
    <div className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral">
      <div className="flex items-center px-v2-x1-5 pt-safe">
        <BackButton fallbackHref="/" />
      </div>
      <div className="flex flex-col gap-v2-x4 px-v2-x4 pb-v2-x6">
        <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title">{label.inbox}</h1>

        {failed ? (
          <div className="flex flex-col items-start gap-v2-x3">
            <p className="text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">{system.inboxFailed}</p>
            <button
              type="button"
              onClick={() => {
                setFailed(false);
                void load();
              }}
              className="flex min-h-v2-x10 items-center rounded-v2-pill border border-v2-stroke-neutral-weak px-v2-x3-5 text-v2-t4 font-v2-bold text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
            >
              {label.retry}
            </button>
          </div>
        ) : rows === null ? (
          <p className="text-v2-t4 text-v2-fg-neutral-muted">{system.inboxLoading}</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-v2-x3 py-v2-x16 text-center">
            <RomiAvatar size="lg" />
            <p className="text-v2-t6 font-v2-bold">{system.inboxEmptyTitle}</p>
            <p className="text-v2-t4 text-v2-fg-neutral-muted">{system.inboxEmptyBody}</p>
          </div>
        ) : (
          <>
            {groups.map((g) => (
              <section key={g.title} className="flex flex-col">
                <h2 className="pb-v2-x1 text-v2-t3 font-v2-bold text-v2-fg-neutral-muted">{g.title}</h2>
                <ul className="flex flex-col">
                  {g.rows.map((r) => {
                    const Icon = ICON[inboxIcon(r)];
                    const unread = !r.readAt;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => open(r)}
                          className="flex w-full items-start gap-v2-x3 py-v2-x3 text-left active:bg-v2-bg-transparent-pressed"
                        >
                          <Icon
                            aria-hidden
                            className={clsx(
                              "mt-v2-x0-5 size-[var(--roam-v2-icon-size-md)] shrink-0",
                              inboxIcon(r) === "brand"
                                ? "fill-v2-fg-brand text-v2-fg-brand"
                                : "text-v2-fg-neutral",
                            )}
                          />
                          <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5">
                            <span
                              className={clsx(
                                "text-v2-t5 text-v2-fg-neutral",
                                unread ? "font-v2-bold" : "font-v2-medium",
                              )}
                            >
                              {r.title}
                            </span>
                            {r.body && (
                              <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{r.body}</span>
                            )}
                          </span>
                          <span className="shrink-0 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
                            {inboxTimeLabel(r.createdAt)}
                          </span>
                          {unread && (
                            <span className="sr-only">{label.inboxHasNew}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{system.inboxFooter}</p>
          </>
        )}
      </div>
    </div>
  );
}
