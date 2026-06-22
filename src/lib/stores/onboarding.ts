"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  CompanionType,
  MovementPreference,
  VisitPurpose,
} from "@/lib/types";

export interface OnboardingDraft {
  visitPurposes: VisitPurpose[];
  interests: string[];
  availableMinutes?: number;
  movementPreference?: MovementPreference;
  companionType?: CompanionType;
}

interface OnboardingState extends OnboardingDraft {
  togglePurpose: (v: VisitPurpose) => void;
  toggleInterest: (slug: string) => void;
  setTime: (m: number) => void;
  setMovement: (v: MovementPreference) => void;
  setCompanion: (v: CompanionType) => void;
  reset: () => void;
  isComplete: () => boolean;
}

const initial: OnboardingDraft = { visitPurposes: [], interests: [] };

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...initial,
      togglePurpose: (v) =>
        set((s) => ({
          visitPurposes: s.visitPurposes.includes(v)
            ? s.visitPurposes.filter((p) => p !== v)
            : [...s.visitPurposes, v],
        })),
      toggleInterest: (slug) =>
        set((s) => ({
          interests: s.interests.includes(slug)
            ? s.interests.filter((i) => i !== slug)
            : [...s.interests, slug],
        })),
      setTime: (availableMinutes) => set({ availableMinutes }),
      setMovement: (movementPreference) => set({ movementPreference }),
      setCompanion: (companionType) => set({ companionType }),
      reset: () => set({ ...initial }),
      isComplete: () => {
        const s = get();
        return Boolean(
          s.visitPurposes.length > 0 &&
          s.interests.length > 0 &&
          s.availableMinutes &&
          s.movementPreference &&
          s.companionType,
        );
      },
    }),
    {
      name: "roam-onboarding",
      storage: createJSONStorage(() => sessionStorage),
    },
  ),
);
