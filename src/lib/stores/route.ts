"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { RoutePlan } from "@/lib/types";

interface RouteState {
  route: RoutePlan | null;
  setRoute: (r: RoutePlan | null) => void;
  markVisited: (boothId: string) => void;
  setCurrent: (boothId: string) => void;
  clear: () => void;
}

export const useRouteStore = create<RouteState>()(
  persist(
    (set) => ({
      route: null,
      setRoute: (route) => set({ route }),
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
        set((s) => (s.route ? { route: { ...s.route, currentBoothId: boothId } } : s)),
      clear: () => set({ route: null }),
    }),
    { name: "roam-route", storage: createJSONStorage(() => sessionStorage) },
  ),
);
