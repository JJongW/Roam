import { describe, expect, it } from "vitest";
import {
  canShowAppOnboarding,
  isAppOnboardingDismissed,
  isBoothDeepLinkPath,
} from "@/lib/onboarding/app-onboarding-gate";

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

describe("canShowAppOnboarding", () => {
  it("랜딩(/)에서도 뜬다 — 홈을 먼저 보여줘도 OAuth 재심사가 계속 반려돼서 이 제약을 없앴다", () => {
    expect(canShowAppOnboarding("/")).toBe(true);
  });

  it("전시 상세에서도 뜬다", () => {
    expect(canShowAppOnboarding("/exhibitions/sibf-2026")).toBe(true);
  });

  it("지도에서도 뜬다 — 공유 링크로 바로 들어온 사람도 만나야 한다", () => {
    expect(canShowAppOnboarding("/exhibitions/sibf-2026/map")).toBe(true);
  });

  it("부스 상세에서도 뜬다", () => {
    expect(canShowAppOnboarding("/booths/b_a1406")).toBe(true);
  });
});

describe("isBoothDeepLinkPath", () => {
  it("부스 상세 경로는 배너 완화 대상", () => {
    expect(isBoothDeepLinkPath("/booths/b_a1406")).toBe(true);
  });

  it("홈·전시·지도는 대상 아님 — 기존 풀스크린 그대로", () => {
    expect(isBoothDeepLinkPath("/")).toBe(false);
    expect(isBoothDeepLinkPath("/exhibitions/sibf-2026")).toBe(false);
    expect(isBoothDeepLinkPath("/exhibitions/sibf-2026/map")).toBe(false);
  });
});
