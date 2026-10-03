import { describe, expect, it } from "vitest";
import { primaryAction } from "./primary-action";

describe("primaryAction — 한 화면에 primary 하나", () => {
  it("비로그인이면 피드가 primary다 (열람은 공개, 온보딩은 계정에 묶인다)", () => {
    expect(
      primaryAction({ signedIn: false, hasChosenValues: false, judgedCount: 0 }),
    ).toBe("feed");
  });

  it("로그인했고 가치를 안 골랐으면 온보딩이 primary다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: false, judgedCount: 0 }),
    ).toBe("onboarding");
  });

  it("가치를 골랐고 판정이 없으면 피드가 primary다 — 약속한 결과를 즉시 보여준다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: true, judgedCount: 0 }),
    ).toBe("feed");
  });

  it("판정이 1건이라도 있으면 마무리가 primary다 — 끝을 설계하지 않으면 마지막 기억이 '앱을 닫았다'가 된다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: true, judgedCount: 1 }),
    ).toBe("finish");
  });

  it("가치를 안 골랐어도 판정이 쌓였으면 마무리가 이긴다 — 온보딩을 건너뛰고 반응만 한 사람도 회고로 갈 수 있어야 한다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: false, judgedCount: 3 }),
    ).toBe("finish");
  });

  it("비로그인은 판정이 있어도 마무리로 보내지 않는다 — 회고는 계정에 쓰인다", () => {
    expect(
      primaryAction({ signedIn: false, hasChosenValues: false, judgedCount: 5 }),
    ).toBe("feed");
  });
});
