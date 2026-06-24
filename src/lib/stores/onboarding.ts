"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AgeGroup,
  CompanionType,
  MovementPreference,
  VisitPurpose,
} from "@/lib/types";

export interface OnboardingDraft {
  visitPurposes: VisitPurpose[];
  interests: string[];
  /** Keywords the visitor picked under each interest (context signal). */
  keywords: string[];
  age?: AgeGroup;
  availableMinutes?: number;
  movementPreference?: MovementPreference;
  companionType?: CompanionType;
}

interface OnboardingState extends OnboardingDraft {
  togglePurpose: (v: VisitPurpose) => void;
  toggleInterest: (slug: string) => void;
  setInterests: (slugs: string[]) => void;
  toggleKeyword: (kw: string) => void;
  setAge: (v: AgeGroup) => void;
  setTime: (m: number) => void;
  setMovement: (v: MovementPreference) => void;
  setCompanion: (v: CompanionType) => void;
  reset: () => void;
  isComplete: () => boolean;
}

const initial: OnboardingDraft = {
  visitPurposes: [],
  interests: [],
  keywords: [],
};

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
      setInterests: (interests) => set({ interests }),
      toggleKeyword: (kw) =>
        set((s) => ({
          keywords: s.keywords.includes(kw)
            ? s.keywords.filter((k) => k !== kw)
            : [...s.keywords, kw],
        })),
      setAge: (age) => set({ age }),
      setTime: (availableMinutes) => set({ availableMinutes }),
      setMovement: (movementPreference) => set({ movementPreference }),
      setCompanion: (companionType) => set({ companionType }),
      reset: () => set({ ...initial }),
      isComplete: () => {
        const s = get();
        // New onboarding asks interests · age · purpose only.
        return Boolean(
          s.visitPurposes.length > 0 && s.interests.length > 0 && s.age,
        );
      },
    }),
    {
      // localStorage so the visitor's onboarding answers (관심·나이·목적) persist
      // across tab close / reopen on the same device, not just the tab session.
      name: "roam-onboarding",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
