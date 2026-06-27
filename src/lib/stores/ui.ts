"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * One-time UI affordances that should fire only on the visitor's first map
 * visit and never again — the post-onboarding map guide and the "you can rotate
 * to landscape" hint. Persisted locally (anonymous app, no account).
 */
interface UiState {
  /** The map button/icon guide popup has been shown + dismissed. */
  mapGuideSeen: boolean;
  /** The "rotate to landscape" hint toast has been shown. */
  landscapeHintSeen: boolean;
  markMapGuideSeen: () => void;
  markLandscapeHintSeen: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      mapGuideSeen: false,
      landscapeHintSeen: false,
      markMapGuideSeen: () => set({ mapGuideSeen: true }),
      markLandscapeHintSeen: () => set({ landscapeHintSeen: true }),
    }),
    { name: "roam-ui", storage: createJSONStorage(() => localStorage) },
  ),
);
