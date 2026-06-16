"use client";

import { create } from "zustand";
import type { Point } from "@/lib/types";

interface MapState {
  scale: number;
  offset: Point;
  selectedBoothId: string | null;
  /** Manually-set or tracked visitor position in map coordinates. */
  position: Point | null;
  setScale: (s: number) => void;
  setOffset: (o: Point) => void;
  pan: (dx: number, dy: number) => void;
  select: (id: string | null) => void;
  setPosition: (p: Point | null) => void;
  reset: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  scale: 1,
  offset: { x: 0, y: 0 },
  selectedBoothId: null,
  position: null,
  setScale: (scale) => set({ scale: Math.min(3, Math.max(0.5, scale)) }),
  setOffset: (offset) => set({ offset }),
  pan: (dx, dy) => set((s) => ({ offset: { x: s.offset.x + dx, y: s.offset.y + dy } })),
  select: (selectedBoothId) => set({ selectedBoothId }),
  setPosition: (position) => set({ position }),
  reset: () => set({ scale: 1, offset: { x: 0, y: 0 }, selectedBoothId: null }),
}));
