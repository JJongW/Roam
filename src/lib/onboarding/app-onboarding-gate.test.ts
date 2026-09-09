import { describe, expect, it } from "vitest";
import {
  canShowAppOnboarding,
  isAppOnboardingDismissed,
  isBoothDeepLinkPath,
  onboardingDismissOwner,
} from "@/lib/onboarding/app-onboarding-gate";

describe("isAppOnboardingDismissed", () => {
  it("비로그인 + 로컬 기록 없음 → 안 끝남(다시 뜸)", () => {
    expect(
      isAppOnboardingDismissed({
        userId: null,
        needsOnboarding: true,
        dismissedBy: null,
      }),
    ).toBe(false);
  });

  it("비로그인 + 비로그인으로 껐음 → 이 브라우저에선 안 뜬다", () => {
    expect(
      isAppOnboardingDismissed({
        userId: null,
        needsOnboarding: true,
        dismissedBy: "anon",
      }),
    ).toBe(true);
  });

  // 이 파일의 핵심 회귀 — 예전엔 로컬 dismissal이 무조건 이겨서, 비로그인으로
  // 한 번 건너뛴 브라우저는 로그인해도 온보딩이 영영 안 떴다.
  it("비로그인으로 껐다가 로그인 → 다시 뜬다(계정에 취향이 없으면)", () => {
    expect(
      isAppOnboardingDismissed({
        userId: "u1",
        needsOnboarding: true,
        dismissedBy: "anon",
      }),
    ).toBe(false);
  });

  it("비로그인으로 껐다가 로그인 → 계정에 이미 취향이 있으면 안 뜬다", () => {
    expect(
      isAppOnboardingDismissed({
        userId: "u1",
        needsOnboarding: false,
        dismissedBy: "anon",
      }),
    ).toBe(true);
  });

  // 로그인 응답의 needsOnboarding은 로그인 시점 기준이라 낡을 수 있다 —
  // 내가 방금 끝낸 기록이 있으면 그게 이긴다.
  it("이 계정이 직접 껐으면 needsOnboarding이 낡아도 안 뜬다", () => {
    expect(
      isAppOnboardingDismissed({
        userId: "u1",
        needsOnboarding: true,
        dismissedBy: "u1",
      }),
    ).toBe(true);
  });

  it("같은 브라우저에서 다른 계정으로 로그인하면 그 계정 기준으로 판정한다", () => {
    expect(
      isAppOnboardingDismissed({
        userId: "u2",
        needsOnboarding: true,
        dismissedBy: "u1",
      }),
    ).toBe(false);
  });

  it("옛 값 '1'이 남아 있어도 안전하다 — 로그인이면 서버 신호를 본다", () => {
    expect(
      isAppOnboardingDismissed({
        userId: "u1",
        needsOnboarding: true,
        dismissedBy: "1",
      }),
    ).toBe(false);
    expect(
      isAppOnboardingDismissed({
        userId: null,
        needsOnboarding: true,
        dismissedBy: "1",
      }),
    ).toBe(true);
  });

  it("로그인 + 기록 없음 + 서버가 필요하다고 함 → 뜬다", () => {
    expect(
      isAppOnboardingDismissed({
        userId: "u1",
        needsOnboarding: true,
        dismissedBy: null,
      }),
    ).toBe(false);
  });
});

describe("onboardingDismissOwner", () => {
  it("비로그인은 anon, 로그인은 계정 id", () => {
    expect(onboardingDismissOwner(null)).toBe("anon");
    expect(onboardingDismissOwner(undefined)).toBe("anon");
    expect(onboardingDismissOwner("u1")).toBe("u1");
  });
});

describe("canShowAppOnboarding", () => {
  it("모든 경로에서 뜬다 — 랜딩 포함", () => {
    expect(canShowAppOnboarding("/")).toBe(true);
    expect(canShowAppOnboarding("/exhibitions/sibf-2026")).toBe(true);
  });
});

describe("isBoothDeepLinkPath", () => {
  it("부스 상세만 딥링크로 본다", () => {
    expect(isBoothDeepLinkPath("/booths/abc")).toBe(true);
    expect(isBoothDeepLinkPath("/exhibitions/x")).toBe(false);
  });
});
