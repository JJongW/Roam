"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Heart } from "lucide-react";
import { clsx } from "clsx";
import { useAuthStore } from "@/lib/stores/auth";
import {
  loadBrandHearts,
  pushBrandHeart,
  setBrandHeart,
  useBrandHeartStore,
} from "@/lib/stores/brand-hearts";
import { takeLoginPrompt } from "@/components/booth-v2/booth-actions";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { SnackbarState } from "@/components/v2/snackbar";

type Show = (s: Omit<SnackbarState, "key">) => void;

/**
 * UI 19 A안 브랜드 줄(Figma 부품 `UI/브랜드 줄 하트`, 화면 19-A1~A5). 부스 상세 안에서 그 부스를 낸
 * 브랜드에 하트를 남긴다. iOS `BoothPageScreen.brandRow`(Roam-ios #193)와 같은 자리, 같은 모양이다.
 *
 * - 부스 하트와 따로 남고 서로 지우지 않는다(11-17, 11-19).
 * - 로그인 전에도 이 브라우저에 남긴다. 부스 하트(5-02)처럼 처음 한 번 로그인을 권한다(19-A3).
 *   로그인하면 stores/auth.ts가 계정으로 올린다.
 * - 빼기는 확인 없이 바로, 4초 스낵바로 되돌린다(19-A4). 브라우저에 못 쓰면 19-A5.
 * - 스낵바는 상세 화면 하나를 같이 쓴다(한 번에 하나, 섹션 33).
 */
export function BrandRow({
  exhibitorId,
  name,
  exhibitionSlug,
  show,
}: {
  exhibitorId: string;
  /** 브랜드 이름. 서버가 못 읽었으면 부스 이름으로 물러선다(호출부). */
  name: string;
  exhibitionSlug?: string;
  show: Show;
}) {
  const router = useRouter();
  const signedIn = useAuthStore((s) => !!s.user);
  const on = useBrandHeartStore((s) => !!s.hearts[exhibitorId]);
  useEffect(() => loadBrandHearts(), []);

  const base = { exhibitionSlug, screen: SCREEN.brandRow };

  const add = (undo: boolean) => {
    if (!setBrandHeart(exhibitorId, true)) {
      track("heart_save_fail", {
        ...base,
        screen: SCREEN.brandHeartFailed,
        props: { surface: "brand_row" },
      });
      show({
        message: system.brandHeartSaveFailed,
        actionLabel: label.retry,
        onAction: () => add(undo),
      });
      return;
    }
    if (undo) {
      track("brand_heart_undo", { ...base, screen: SCREEN.brandHeartUndo });
    } else {
      track("brand_heart_add", {
        ...base,
        props: { from: "detail_row", is_logged_in: signedIn },
      });
    }
    if (signedIn) {
      void pushBrandHeart(exhibitorId);
      if (!undo) show({ message: system.brandHeartLeft(name) });
    } else if (!undo && takeLoginPrompt()) {
      track("login_prompt_shown", {
        exhibitionSlug,
        screen: SCREEN.brandHeartLoginPrompt,
        props: { from: "brand_heart" },
      });
      show({
        message: system.brandHeartLoginPrompt,
        actionLabel: label.login,
        onAction: () => {
          track("login_prompt_tap", {
            exhibitionSlug,
            screen: SCREEN.brandHeartLoginPrompt,
            props: { from: "brand_heart" },
          });
          router.push(
            `/login?next=${encodeURIComponent(location.pathname + location.search)}`,
          );
        },
      });
    }
  };

  const remove = () => {
    if (!setBrandHeart(exhibitorId, false)) {
      // 빼기를 못 쓴 경우는 화면 상태가 그대로라 따로 띠를 세우지 않는다(Figma 19-A5는 남기기 실패만 그림).
      return;
    }
    track("brand_heart_remove", { ...base, props: { is_logged_in: signedIn } });
    if (signedIn) void pushBrandHeart(exhibitorId);
    show({
      message: system.brandHeartRemoved(name),
      actionLabel: label.undo,
      onAction: () => add(true),
    });
  };

  return (
    <section
      aria-label={label.brand}
      className="flex items-center gap-v2-x3 rounded-v2-r3 border border-v2-stroke-neutral-weak bg-v2-bg-layer-default py-v2-x3-5 pl-v2-x4 pr-v2-x3"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-v2-x0-5">
        <span className="text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
          {label.brand}
        </span>
        <span className="break-words text-v2-t5 font-v2-bold text-v2-fg-neutral">
          {name}
        </span>
        <span className="text-v2-t3 font-v2-regular text-v2-fg-neutral-muted">
          {signedIn ? system.brandRowLoggedIn : system.brandRowLoggedOut}
        </span>
      </div>
      <button
        type="button"
        // 누르면 일어날 일을 읽는다(HeartButton과 같은 방식). 이름이 바뀌므로 aria-pressed는 쓰지 않는다.
        aria-label={on ? label.brandHeartRemove : label.brandHeartAdd}
        onClick={() => (on ? remove() : add(false))}
        // 누르는 영역은 44, 보이는 알약은 그 안에서 더 작다(iOS frame(minHeight: x11)과 같다).
        className="group flex min-h-v2-x11 shrink-0 items-center"
      >
        <span
          className={clsx(
            "flex items-center gap-v2-x1-5 whitespace-nowrap rounded-v2-pill border py-v2-x2 pl-v2-x3 pr-v2-x3-5 text-v2-t3 font-v2-medium",
            on
              ? "border-v2-bg-transparent bg-v2-bg-brand-weak text-v2-fg-brand group-active:bg-v2-bg-brand-weak-pressed"
              : "border-v2-stroke-neutral-weak bg-v2-bg-layer-default text-v2-fg-neutral group-active:bg-v2-bg-layer-default-pressed",
          )}
        >
          <Heart
            aria-hidden
            className="size-[var(--roam-v2-icon-size-sm)]"
            fill={on ? "currentColor" : "none"}
          />
          {label.brandHeartPill}
        </span>
      </button>
    </section>
  );
}
