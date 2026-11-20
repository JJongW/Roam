"use client";

import { useCallback, useState } from "react";
import {
  isHearted,
  isVisited,
  pushNote,
  useVisitStore,
  type BoothRecord,
  type VerdictValue,
} from "@/lib/stores/visit";
import { useAuthStore } from "@/lib/stores/auth";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track, type ScreenId } from "@/lib/analytics/app-track";
import type { SnackbarState } from "@/components/v2/snackbar";

/**
 * 부스 하나의 하트와 다녀왔어요(카드 4-01, 상세 4-02가 같이 쓴다).
 *
 * - 하트와 다녀왔어요는 서로 다른 정보다(브랜드 규칙 §4). 하나를 눌러도 다른 하나는 그대로다.
 * - 빼기는 확인 없이 바로 빠지고 스낵바로 되돌린다(11-12 HX-A). 다녀온 곳을 빼면 평가도
 *   같이 빠지므로 그 사실을 말한다(6-06).
 * - 로그인 안 했으면 기기(브라우저)에 남는다. 처음 하트를 남길 때 한 번만 로그인을 권한다(5-02).
 *   저장이 계정에 된다고 약속하지 않는다 — 로그인한 뒤에만 계정에 올라간다.
 * - 기록: iOS와 같은 이름(heart_add, heart_remove, visit_mark, visit_unmark), surface 칸.
 */
let loginPromptShown = false;

/**
 * 로그인 제안(5-02, 19-A3)은 부스 하트와 브랜드 하트를 묶어 한 번만 띄운다(섹션 33, iOS와 같다).
 * 띄울 차례면 true를 돌려주고 표시를 남긴다.
 */
export function takeLoginPrompt(): boolean {
  if (loginPromptShown) return false;
  loginPromptShown = true;
  return true;
}

export function useBoothSignals({
  boothId,
  name,
  surface,
  screen,
  exhibitionSlug,
  onVisitMarked,
}: {
  boothId: string;
  name: string;
  surface: "card" | "detail";
  screen: ScreenId;
  exhibitionSlug?: string;
  /** 다녀왔어요를 켠 직후(되돌리기 말고). 카드는 이걸로 로미 줄(6-03)을 띄운다. 넘기면 스낵바 대신 그쪽이 되돌리기를 맡는다. */
  onVisitMarked?: (before: BoothRecord | undefined) => void;
}) {
  const record = useVisitStore((s) => s.records[boothId]);
  const signedIn = useAuthStore((s) => !!s.user);
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const hearted = isHearted(record);
  const visited = isVisited(record);
  const base = { exhibitionSlug, boothId };

  const show = (s: Omit<SnackbarState, "key">) =>
    setSnack({ ...s, key: Date.now() });
  const close = useCallback(() => setSnack(null), []);

  const toggleHeart = () => {
    const before = useVisitStore.getState().records[boothId];
    const next = !hearted;
    useVisitStore.getState().setHeart(boothId, next);
    void pushNote(boothId, { heart: true });
    track(next ? "heart_add" : "heart_remove", {
      ...base,
      screen,
      props: { surface },
    });
    if (!next) {
      show({
        message: system.heartRemoved(name),
        actionLabel: label.undo,
        onAction: () => {
          useVisitStore.getState().restore(boothId, before);
          void pushNote(boothId, { heart: true });
          track("heart_add", {
            ...base,
            screen: SCREEN.heartUndo,
            props: { surface, undo: true },
          });
        },
      });
    } else if (!signedIn && takeLoginPrompt()) {
      show({
        message: system.loginPrompt,
        actionLabel: label.login,
        // 지금 화면 위에 로그인 시트(5-04)를 띄운다(11-20 Ted, 페이지 이동 대신).
        onAction: () => useAuthStore.getState().openLogin("heart_snackbar"),
      });
    }
  };

  const toggleVisited = () => {
    const before = useVisitStore.getState().records[boothId];
    const next = !visited;
    useVisitStore.getState().setVisited(boothId, next);
    void pushNote(boothId, { visited: true, verdict: !next });
    track(next ? "visit_mark" : "visit_unmark", {
      ...base,
      screen,
      props: next
        ? {
            surface,
            source: surface === "card" ? "card_pill" : "detail",
            had_heart: isHearted(before),
          }
        : {
            surface,
            had_verdict: !!before?.verdict,
            seconds_since_mark: before?.visitedAt
              ? Math.round((Date.now() - Date.parse(before.visitedAt)) / 1000)
              : null,
          },
    });
    if (next) {
      onVisitMarked?.(before);
    } else {
      show({
        message: system.visitRemoved(name, !!before?.verdict),
        actionLabel: label.undo,
        onAction: () => {
          useVisitStore.getState().restore(boothId, before);
          void pushNote(boothId, { visited: true, verdict: true });
          track("visit_undo", { ...base, screen, props: { surface } });
        },
      });
    }
  };

  return {
    hearted,
    visited,
    toggleHeart,
    toggleVisited,
    snack,
    closeSnack: close,
    show,
  };
}

/** 되돌리기 하나: 기록을 이전 값으로 돌리고 서버에 다시 올린다. */
export function restoreRecord(
  boothId: string,
  before: BoothRecord | undefined,
) {
  useVisitStore.getState().restore(boothId, before);
  void pushNote(boothId, { visited: true, verdict: true, heart: true });
}

/**
 * 평가 칩(6-04, 6-09). 같은 칩을 다시 누르면 풀린다. 풀어도 다녀온 기록은 남는다(서버 apply.ts와 같은 규칙).
 * 스낵바는 없다(6-09).
 */
export function chooseVerdict(
  boothId: string,
  value: VerdictValue,
  surface: "today_sheet" | "detail_ended" | "detail",
  ctx: { screen: ScreenId; exhibitionSlug?: string },
) {
  const before = useVisitStore.getState().records[boothId]?.verdict;
  useVisitStore.getState().setVerdict(boothId, value);
  void pushNote(boothId, { verdict: true, visited: true });
  const base = {
    screen: ctx.screen,
    exhibitionSlug: ctx.exhibitionSlug,
    boothId,
  };
  if (before === value)
    track("verdict_cleared", { ...base, props: { surface } });
  else
    track("verdict_set", {
      ...base,
      props: { value, surface, changed_from: before ?? null },
    });
}

/**
 * 메모 한 줄 저장(6-04, 6-07, 6-08). 다 지우고 저장하면 확인 없이 지우고 되돌리기를 준다.
 * 길이와 고침 여부만 기록한다(글은 보내지 않는다).
 */
export function saveMemo(
  boothId: string,
  name: string,
  text: string,
  ctx: {
    screen: ScreenId;
    exhibitionSlug?: string;
    show?: (s: Omit<SnackbarState, "key">) => void;
  },
) {
  const prev = useVisitStore.getState().records[boothId];
  const before = prev?.memo?.trim() ?? "";
  const next = text.trim();
  if (next === before) return;
  useVisitStore.getState().setMemo(boothId, next);
  void pushNote(boothId, {});
  const base = {
    screen: ctx.screen,
    exhibitionSlug: ctx.exhibitionSlug,
    boothId,
  };
  if (!next) {
    track("memo_cleared", base);
    ctx.show?.({
      message: system.memoCleared(name),
      actionLabel: label.undo,
      onAction: () => {
        useVisitStore.getState().setMemo(boothId, before);
        void pushNote(boothId, {});
        track("memo_undo", base);
      },
    });
  } else {
    track("memo_saved", {
      ...base,
      props: { length: next.length, is_edit: !!before },
    });
  }
}
