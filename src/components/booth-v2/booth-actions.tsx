"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { isHearted, isVisited, pushNote, useVisitStore } from "@/lib/stores/visit";
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

export function useBoothSignals({
  boothId,
  name,
  surface,
  screen,
  exhibitionSlug,
}: {
  boothId: string;
  name: string;
  surface: "card" | "detail";
  screen: ScreenId;
  exhibitionSlug?: string;
}) {
  const router = useRouter();
  const record = useVisitStore((s) => s.records[boothId]);
  const signedIn = useAuthStore((s) => !!s.user);
  const [snack, setSnack] = useState<SnackbarState | null>(null);
  const hearted = isHearted(record);
  const visited = isVisited(record);
  const base = { exhibitionSlug, boothId };

  const show = (s: Omit<SnackbarState, "key">) => setSnack({ ...s, key: Date.now() });
  const close = useCallback(() => setSnack(null), []);

  const toggleHeart = () => {
    const before = useVisitStore.getState().records[boothId];
    const next = !hearted;
    useVisitStore.getState().setHeart(boothId, next);
    void pushNote(boothId, { heart: true });
    track(next ? "heart_add" : "heart_remove", { ...base, screen, props: { surface } });
    if (!next) {
      show({
        message: system.heartRemoved(name),
        actionLabel: label.undo,
        onAction: () => {
          useVisitStore.getState().restore(boothId, before);
          void pushNote(boothId, { heart: true });
          track("heart_add", { ...base, screen: SCREEN.heartUndo, props: { surface, undo: true } });
        },
      });
    } else if (!signedIn && !loginPromptShown) {
      loginPromptShown = true;
      show({
        message: system.loginPrompt,
        actionLabel: label.login,
        onAction: () => router.push(`/login?next=${encodeURIComponent(location.pathname + location.search)}`),
      });
    }
  };

  const toggleVisited = () => {
    const before = useVisitStore.getState().records[boothId];
    const next = !visited;
    useVisitStore.getState().setVisited(boothId, next);
    void pushNote(boothId, { visited: true, verdict: !next });
    track(next ? "visit_mark" : "visit_unmark", { ...base, screen, props: { surface } });
    if (!next) {
      show({
        message: system.visitRemoved(name, !!before?.verdict),
        actionLabel: label.undo,
        onAction: () => {
          useVisitStore.getState().restore(boothId, before);
          void pushNote(boothId, { visited: true, verdict: true });
          track("visit_mark", { ...base, screen, props: { surface, undo: true } });
        },
      });
    }
  };

  return { hearted, visited, toggleHeart, toggleVisited, snack, closeSnack: close };
}
