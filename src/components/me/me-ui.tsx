"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Heart,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";
import { BackButton } from "@/components/v2/back-button";
import type { SnackbarState } from "@/components/v2/snackbar";
import { label, system } from "@/lib/copy/v1";
import { pushNote, useVisitStore } from "@/lib/stores/visit";
import { track, type ScreenId } from "@/lib/analytics/app-track";
import type { MeBoothRow } from "@/lib/me/view";

/** 마이페이지와 설정 화면의 틀. 넓은 화면에서는 가운데 한 줄로 둔다. */
export function MePage({
  children,
  back,
  bottom,
  snack,
}: {
  children: ReactNode;
  /** 뒤로 버튼이 갈 곳(공유 링크로 바로 들어왔을 때). 없으면 뒤로 버튼이 없다(마이페이지 첫 화면). */
  back?: string;
  /** 화면 맨 아래 붙는 버튼(14-05 지도 보기, 15-11 계정 지우기) */
  bottom?: ReactNode;
  /**
   * 이 화면의 스낵바. 아래 바가 있으면 그 윗선 위 8, 없으면 안전 영역 위 8(Figma 18-T 자리, 11-25 결정).
   * iOS `snackbarFloor`와 같은 규칙(Roam-ios #240).
   */
  snack?: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral">
      <div className="mx-auto flex w-full max-w-[var(--roam-v2-size-content-max-width)] flex-col pb-v2-x10">
        {back && (
          // 스크롤해도 뒤로가 남게 위에 붙인다(부스 상세 머리와 같은 방식).
          <div className="sticky top-0 z-20 flex items-center bg-v2-bg-layer-default px-v2-x1-5 pt-safe">
            <BackButton fallbackHref={back} />
          </div>
        )}
        {children}
      </div>
      {bottom ? (
        <div className="sticky bottom-0 z-20 border-t border-v2-stroke-neutral-muted bg-v2-bg-layer-default px-v2-x4 pb-safe pt-v2-x3">
          {snack && (
            <div className="pointer-events-none absolute inset-x-0 bottom-full mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] px-v2-x4 pb-v2-x2">
              {snack}
            </div>
          )}
          <div className="mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] pb-v2-x3">
            {bottom}
          </div>
        </div>
      ) : (
        snack && (
          <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] px-v2-x4 pb-safe">
            <div className="pb-v2-x2">{snack}</div>
          </div>
        )
      )}
    </div>
  );
}

/** 뒤로 아래 제목(14-02, 14-10, 15-01 "설정"). */
export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-v2-x1 px-v2-x4 pb-v2-x2 pt-v2-x2">
      <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title">{title}</h1>
      {sub && (
        <p className="whitespace-pre-line text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
          {sub}
        </p>
      )}
    </div>
  );
}

/** UI/구역 머리(3003:4509). 16 Medium, 오른쪽 동작은 갈 곳이 있을 때만. */
export function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-center gap-v2-x2 px-v2-x4 pb-v2-x2 pt-v2-x6">
      <h2 className="min-w-0 flex-1 text-v2-t5 font-v2-medium">{title}</h2>
      {action && (
        <Link
          href={action.href}
          className="flex items-center gap-v2-x1 text-v2-t4 font-v2-medium text-v2-fg-neutral-muted"
        >
          {action.label}
          <ChevronRight aria-hidden className="size-[var(--roam-v2-icon-size-md)]" />
        </Link>
      )}
    </div>
  );
}

/** 설정의 작은 묶음 머리(15-01 "알림", "내 기록"). */
export function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-v2-x4 pb-v2-x1 pt-v2-x5 text-v2-t2 font-v2-regular text-v2-fg-neutral-muted">
      {children}
    </p>
  );
}

/** 흰 카드 묶음(하트 묶음, 다녀온 박람회 목록). */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "flex flex-col overflow-hidden rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * UI/박람회 묶음 머리(3003:4498). 다가오거나 열린 박람회는 오른쪽 화살표(그 박람회 하트 묶음 14-05로),
 * 끝난 박람회는 접힘(아래 화살표)과 펼침(위 화살표). 접힌 머리에는 수를 적지 않는다.
 */
export function FairGroupHead({
  name,
  when,
  href,
  toggle,
}: {
  name: string;
  when: string;
  href?: string;
  toggle?: { open: boolean; onToggle: () => void };
}) {
  const inner = (
    <>
      <MapPin aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral" />
      <span className="min-w-0 flex-1 text-v2-t4 font-v2-bold">{name}</span>
      <span className="shrink-0 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{when}</span>
      {toggle ? (
        toggle.open ? (
          <ChevronUp aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0" />
        ) : (
          <ChevronDown aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0" />
        )
      ) : (
        href && <ChevronRight aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0" />
      )}
    </>
  );
  const cls =
    "flex min-h-v2-x12 w-full items-center gap-v2-x3 px-v2-x4 py-v2-x3 text-left active:bg-v2-bg-neutral-weak";
  if (toggle)
    return (
      <button
        type="button"
        aria-expanded={toggle.open}
        aria-label={`${name}, ${when}, ${toggle.open ? label.collapse : label.expand}`}
        onClick={toggle.onToggle}
        className={cls}
      >
        {inner}
      </button>
    );
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  return <div className={cls}>{inner}</div>;
}

/**
 * UI/하트 줄(3003:4470). 하트 20(누르면 빠짐), 글 x=48, 오른쪽 부스 번호. 하트 아이콘은 줄에 하나만.
 * 줄의 나머지를 누르면 부스 상세로 간다.
 */
export function HeartRow({
  name,
  sub,
  trailing,
  href,
  onRemove,
  removeLabel = label.heartRemove,
}: {
  name: string;
  sub?: string;
  trailing?: string;
  href?: string;
  onRemove: () => void;
  removeLabel?: string;
}) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 font-v2-medium">
        <span className="text-v2-t5">{name}</span>
        {sub && <span className="text-v2-t3 text-v2-fg-neutral-muted">{sub}</span>}
      </span>
      {trailing && (
        <span className="shrink-0 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
          {trailing}
        </span>
      )}
    </>
  );
  return (
    <li className="flex min-h-v2-x12 items-center pr-v2-x4">
      <button
        type="button"
        aria-label={`${name}, ${removeLabel}`}
        onClick={onRemove}
        className="flex size-v2-x12 shrink-0 items-center justify-center text-v2-fg-brand active:bg-v2-bg-transparent-pressed"
      >
        <Heart aria-hidden fill="currentColor" className="size-[var(--roam-v2-icon-size-md)]" />
      </button>
      {href ? (
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-v2-x3 py-v2-x2">
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-v2-x3 py-v2-x2">{body}</div>
      )}
    </li>
  );
}

/**
 * UI/정보 줄(2992:740). 왼쪽은 20 선 아이콘만, 글 시작점 x=48. 화살표는 누르면 어딘가로 가는 줄에만.
 */
export function InfoRow({
  icon: Icon,
  title,
  sub,
  value,
  href,
  onClick,
  arrow,
}: {
  icon: LucideIcon;
  title: string;
  sub?: string;
  value?: string;
  href?: string;
  onClick?: () => void;
  /** 이동하는 줄인지. 기본은 href가 있으면 화살표. */
  arrow?: boolean;
}) {
  const showArrow = arrow ?? !!href;
  const inner = (
    <>
      <Icon aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral" />
      <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5 text-left font-v2-medium">
        <span className="text-v2-t5">{title}</span>
        {sub && <span className="text-v2-t3 text-v2-fg-neutral-muted">{sub}</span>}
      </span>
      {(value || showArrow) && (
        <span className="flex shrink-0 items-center gap-v2-x1 text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">
          {value}
          {showArrow && (
            <ChevronRight aria-hidden className="size-[var(--roam-v2-icon-size-md)] text-v2-fg-neutral" />
          )}
        </span>
      )}
    </>
  );
  const cls =
    "flex min-h-v2-x12 w-full items-center gap-v2-x3 px-v2-x4 py-v2-x3 active:bg-v2-bg-neutral-weak";
  if (href)
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  if (onClick)
    return (
      <button type="button" onClick={onClick} className={cls}>
        {inner}
      </button>
    );
  return <div className={cls}>{inner}</div>;
}

/**
 * 목록에서 부스 하트 빼기(14-09). 확인 없이 바로 빠지고 스낵바로 되돌린다(11-12 HX-A).
 * 체크와 메모는 남는다(setHeart만 바꾼다).
 */
export function useHeartRemove(screen: ScreenId) {
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const close = useCallback(() => setSnack(null), []);
  const remove = (row: MeBoothRow, exhibitionSlug?: string) => {
    const before = useVisitStore.getState().records[row.boothId];
    useVisitStore.getState().setHeart(row.boothId, false);
    void pushNote(row.boothId, { heart: true });
    const base = { exhibitionSlug, boothId: row.boothId };
    track("heart_remove", { ...base, screen, props: { surface: "mypage" } });
    setSnack({
      key: Date.now(),
      message: system.heartRemoved(row.name),
      actionLabel: label.undo,
      onAction: () => {
        useVisitStore.getState().restore(row.boothId, before);
        void pushNote(row.boothId, { heart: true });
        track("heart_add", { ...base, screen, props: { surface: "mypage", undo: true } });
      },
    });
  };
  return { snack, close, remove, show: setSnack };
}
