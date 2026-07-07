"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RoutePlan } from "@/lib/types";

interface RouteState {
  route: RoutePlan | null;
  /** 관람 시작 시각(ms) — 지도 진입 시 기록. Planner 재계획의 경과 시간 산정용. */
  startedAt: number | null;
  setRoute: (r: RoutePlan | null) => void;
  setStartedAt: (ts: number) => void;
  markVisited: (boothId: string) => void;
  setCurrent: (boothId: string) => void;
  clear: () => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set) => ({
      route: null,
      startedAt: null,
      setRoute: (route) => set({ route }),
      setStartedAt: (startedAt) => set({ startedAt }),
      markVisited: (boothId) =>
        set((s) =>
          s.route
            ? {
                route: {
                  ...s.route,
                  visitedBoothIds: s.route.visitedBoothIds.includes(boothId)
                    ? s.route.visitedBoothIds
                    : [...s.route.visitedBoothIds, boothId],
                },
              }
            : s,
        ),
      setCurrent: (boothId) =>
        set((s) =>
          s.route ? { route: { ...s.route, currentBoothId: boothId } } : s,
        ),
      clear: () => set({ route: null, startedAt: null }),
    }),
    // localStorage so a generated 동선 survives tab close / reopen on the same
    // device (data persists while the phone/session is kept). Cleared only by
    // the explicit "동선 비우기".
    { name: "roam-route", storage: createJSONStorage(() => localStorage) },
  ),
);
