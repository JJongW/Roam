"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api/client";
import type { BoothNote } from "@/lib/types";

/** A visitor's personal status for a booth, independent of the active route. */
export type BoothStatus = "visited" | "skipped";

export interface BoothRecord {
  status?: BoothStatus;
  /** Free-form personal note shown on the booth detail + map. */
  memo?: string;
  /** Personal photos (Cloudinary URLs) attached to this booth. */
  photos?: string[];
}

interface VisitState {
  records: Record<string, BoothRecord>;
  /** Toggle a status; selecting the active status clears it. */
  toggleStatus: (boothId: string, status: BoothStatus) => void;
  setStatus: (boothId: string, status: BoothStatus | null) => void;
  setMemo: (boothId: string, memo: string) => void;
  setPhotos: (boothId: string, photos: string[]) => void;
  /** Replace the cache from the server (called after sign-in). */
  setFromNotes: (notes: BoothNote[]) => void;
  clear: () => void;
}

/**
 * Persist a single booth's record to the server. Caller must ensure the user
 * is signed in; the endpoint 401s otherwise (ignored here).
 */
export async function pushNote(boothId: string): Promise<void> {
  const r = useVisitStore.getState().records[boothId];
  try {
    await api.put(`/api/me/notes/${boothId}`, {
      status: r?.status ?? null,
      memo: r?.memo ?? "",
      photos: r?.photos ?? [],
    });
  } catch {
    /* offline / not signed in — local cache still holds it */
  }
}

function patch(
  records: Record<string, BoothRecord>,
  boothId: string,
  next: Partial<BoothRecord>,
): Record<string, BoothRecord> {
  const merged: BoothRecord = { ...records[boothId], ...next };
  // Drop empty records so the store stays compact.
  if (!merged.status && !merged.memo?.trim() && !merged.photos?.length) {
    const { [boothId]: _omit, ...rest } = records;
    return rest;
  }
  return { ...records, [boothId]: merged };
}

export const useVisitStore = create<VisitState>()(
  persist(
    (set) => ({
      records: {},
      toggleStatus: (boothId, status) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            status: s.records[boothId]?.status === status ? undefined : status,
          }),
        })),
      setStatus: (boothId, status) =>
        set((s) => ({
          records: patch(s.records, boothId, { status: status ?? undefined }),
        })),
      setMemo: (boothId, memo) =>
        set((s) => ({ records: patch(s.records, boothId, { memo }) })),
      setPhotos: (boothId, photos) =>
        set((s) => ({ records: patch(s.records, boothId, { photos }) })),
      setFromNotes: (notes) =>
        set(() => {
          const records: Record<string, BoothRecord> = {};
          for (const n of notes) {
            if (n.status || n.memo?.trim() || n.photos?.length)
              records[n.boothId] = {
                status: n.status,
                memo: n.memo,
                photos: n.photos,
              };
          }
          return { records };
        }),
      clear: () => set({ records: {} }),
    }),
    { name: "roam-visit", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Selector helpers for components that only need ids of a given status. */
export function idsByStatus(
  records: Record<string, BoothRecord>,
  status: BoothStatus,
): string[] {
  return Object.entries(records)
    .filter(([, r]) => r.status === status)
    .map(([id]) => id);
}
