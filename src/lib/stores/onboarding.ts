"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AgeGroup,
  CompanionType,
  MovementPreference,
  VisitPurpose,
} from "@/lib/types";
import type { UserPreferenceInput } from "@/lib/schemas";
import type { OnboardingContext } from "@/lib/onboarding/onboarding-types";

export interface OnboardingDraft {
  visitPurposes: VisitPurpose[];
  interests: string[];
  /** Keywords the visitor picked under each interest (context signal). */
  keywords: string[];
  age?: AgeGroup;
  availableMinutes?: number;
  movementPreference?: MovementPreference;
  companionType?: CompanionType;
  /** AI Companion 온보딩 대화에서 누적된 상태(있으면). */
  context?: OnboardingContext;
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
  /** AI Companion 온보딩 완료 시: 빌드된 preference + 대화 context를 한 번에
   *  반영한다. route-view·ai-recommend-sheet가 읽는 레거시 필드도 함께 채워
   *  하위호환을 유지한다. */
  applyProfile: (
    preference: UserPreferenceInput,
    context: OnboardingContext,
  ) => void;
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
      applyProfile: (preference, context) =>
        set({
          visitPurposes: preference.visitPurposes,
          interests: preference.interests,
          availableMinutes: preference.availableMinutes,
          movementPreference: preference.movementPreference,
          companionType: preference.companionType,
          context,
        }),
      reset: () => set({ ...initial }),
      isComplete: () => {
        const s = get();
        // AI Companion 온보딩: 안내 방식까지 고른 context가 있으면 완료.
        if (s.context?.routeStyle) return true;
        // 레거시: interests + purpose가 채워졌으면 완료.
        return Boolean(s.visitPurposes.length > 0 && s.interests.length > 0);
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
