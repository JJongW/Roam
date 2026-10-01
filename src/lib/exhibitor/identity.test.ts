import { describe, expect, it } from "vitest";
import { anchorKey, identityKeys } from "./identity";

const k = (u: string) => anchorKey(u)?.match;

// 2026-10-02 운영 백필 dry-run: 공유 플랫폼 위 사이트들이 플랫폼 이름 하나로 뭉쳐
// 네이버웹툰↔산아쿠아플랜츠↔디어, 파도↔까치돌배주↔프몽 같은 엉터리 연결이 나왔다.
describe("anchorKey — 공유 플랫폼", () => {
  it("하위 도메인 테넌트는 호스트 전체가 신원이다", () => {
    expect(k("https://bambachi.imweb.me")).not.toBe(k("https://pmont.imweb.me/home"));
    expect(k("https://meeso215.cafe24.com")).not.toBe(k("https://slowparis.cafe24.com/m/index.html"));
  });
  it("경로로 계정을 나누는 곳은 경로가 신원이다", () => {
    expect(k("https://notefolio.net/godongsang")).not.toBe(k("https://notefolio.net/ga_wool"));
    expect(k("https://litt.ly/allvin")).not.toBe(k("https://litt.ly/togetherbrewery"));
  });
  it("포털 하위 서비스끼리 묶지 않는다", () => {
    const keys = [
      "https://comic.naver.com/index",
      "https://m.place.naver.com/place/1085405629/home",
      "https://mkt.shopping.naver.com/link/6843fab28dd273404b731a00",
    ].map(k);
    expect(new Set(keys).size).toBe(3);
  });
  it("포털 대문 자체는 신원이 아니다", () => {
    expect(k("https://www.naver.com")).toBeUndefined();
  });
  it("자기 도메인은 끝이 달라도 같다(.com ↔ .co.kr)", () => {
    expect(k("https://www.ksdyeoju.com")).toBe(k("https://ksdyeoju.co.kr"));
  });
  it("같은 인스타는 주소 꼴이 달라도 같다", () => {
    expect(identityKeys({ instagramUrl: "https://www.instagram.com/godongsang/?hl=ko" })).toEqual(
      identityKeys({ instagramUrl: "https://instagram.com/godongsang" }),
    );
  });
  it("scheme 없는 인스타 주소도 읽는다", () => {
    expect(identityKeys({ instagramUrl: "www.instagram.com/slowparis_" })).toEqual(["instagram.com/slowparis_"]);
  });
});
