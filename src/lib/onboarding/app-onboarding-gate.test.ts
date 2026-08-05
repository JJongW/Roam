import { describe, expect, it } from "vitest";
import { isAppOnboardingDismissed } from "@/lib/onboarding/app-onboarding-gate";

describe("isAppOnboardingDismissed", () => {
  it("비로그인 + 로컬 dismiss 안 됨 → 안 끝남(다시 뜸)", () => {
    expect(
      isAppOnboardingDismissed({
        user: null,
        needsOnboarding: true,
        anonDismissed: false,
      }),
    ).toBe(false);
  });

  it("비로그인 + 로컬 dismiss 됨 → 끝남(안 뜸)", () => {
    expect(
      isAppOnboardingDismissed({
        user: null,
        needsOnboarding: true,
        anonDismissed: true,
      }),
    ).toBe(true);
  });

  it("로그인 + 서버가 온보딩 필요하다고 함 + 로컬 dismiss 안 됨 → 안 끝남", () => {
    expect(
      isAppOnboardingDismissed({
        user: { id: "u1" },
        needsOnboarding: true,
        anonDismissed: false,
      }),
    ).toBe(false);
  });

  it("로그인 + 서버가 온보딩 다 했다고 함 → 끝남", () => {
    expect(
      isAppOnboardingDismissed({
        user: { id: "u1" },
        needsOnboarding: false,
        anonDismissed: false,
      }),
    ).toBe(true);
  });

  it("비로그인 때 완료하고 방금 로그인(서버는 아직 동기화 전이라 needsOnboarding=true) → 로컬 dismiss가 우선이라 끝남", () => {
    // 로그인 응답의 needsOnboarding은 소급 반영 전 시점 기준이라 낡을 수 있다 —
    // 이 케이스가 바로 그 타이밍 버그를 재현한다. anonDismissed가 이미 true라
    // 결과에 영향을 안 준다.
    expect(
      isAppOnboardingDismissed({
        user: { id: "u1" },
        needsOnboarding: true,
        anonDismissed: true,
      }),
    ).toBe(true);
  });
});
