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

// 2026-11-20 V.21 백필: 링크 모음 서비스를 도메인으로 맞대서 "러브미모어" 아래 27곳이 뭉쳤다.
describe("anchorKey — 여러 사람이 나눠 쓰는 서비스는 계정이 신원이다", () => {
  const pairs: [string, string, string][] = [
    // [기준 주소, 같은 계정의 다른 꼴, 다른 계정]
    ["https://link.inpock.co.kr/love.me.more", "link.inpock.co.kr/love.me.more?utm=ig", "https://link.inpock.co.kr/moii_ttoi"],
    ["https://instabio.cc/mymousse", "instabio.cc/mymousse", "https://instabio.cc/thepurivillage"],
    [
      "https://grafolio.ogq.me/profile/%EB%AC%B4%EC%9A%B4mouun/projects",
      "https://grafolio.ogq.me/profile/무운mouun/profile",
      "https://grafolio.ogq.me/profile/Ki_rin_/projects",
    ],
    ["https://grafolio.com/sunwoo", "https://www.grafolio.com/sunwoo/works", "https://grafolio.com/kirin"],
    ["https://marpple.shop/kr/heavenfall", "https://marpple.shop/kr/heavenfall/products/1", "https://marpple.shop/kr/roughhands"],
    ["https://www.threads.net/@yifuu.0u", "threads.net/@yifuu.0u?hl=ko", "https://www.threads.net/@09.modernboy"],
    ["https://linkon.id/jiok_store", "linkon.id/jiok_store", "https://linkon.id/sukeydokey"],
    ["https://linkseller.net/jjonglove01", "linkseller.net/jjonglove01/", "https://linkseller.net/rhinofriends"],
    ["https://twenty.style/go/koconenne/NDrhqQm", "https://twenty.style/go/koconenne", "https://twenty.style/profile/posom"],
    [
      "https://www.youtube.com/channel/UCfeDBrN_zGk0hTGB1tc2a8g/featured?app=desktop",
      "https://youtube.com/channel/UCfeDBrN_zGk0hTGB1tc2a8g",
      "https://www.youtube.com/channel/UC4hxY8itYpyCPq1pQaxMp5A",
    ],
    ["https://youtube.com/@dubu_studio", "https://www.youtube.com/@dubu_studio/featured", "https://youtube.com/@iz_olz"],
    [
      "https://www.picturebook-illust.com/author-gallery/room/54141",
      "https://picturebook-illust.com/author-gallery/room/54141",
      "https://www.picturebook-illust.com/author-gallery/room/70093",
    ],
    [
      "https://www.xiaohongshu.com/user/profile/65bb5769000000000903c46f",
      "https://www.xiaohongshu.com/user/profile/65bb5769000000000903c46f?xsec=1",
      "https://www.xiaohongshu.com/user/profile/596eba7b5e87e76eea0147c5",
    ],
    ["https://brunch.co.kr/@juaooju", "https://brunch.co.kr/@juaooju/12", "https://brunch.co.kr/@jellynoise"],
    ["https://www.postype.com/@d33pinthesea", "https://postype.com/@d33pinthesea/post/1", "https://postype.com/@kangmacheol"],
    ["https://www.artstation.com/mj_kim", "https://artstation.com/mj_kim", "https://www.artstation.com/mongchee10"],
    ["https://etsy.com/shop/Lily100Designs", "https://www.etsy.com/shop/Lily100Designs?ref=x", "https://www.etsy.com/shop/StudioNimo"],
    ["https://linkbio.co/SAELAH", "linkbio.co/SAELAH", "https://linkbio.co/5102707m0efJY"],
    ["https://linkfly.to/61110hv3z7C", "linkfly.to/61110hv3z7C", "https://linkfly.to/50530xCe3VR"],
    ["https://revind.io/plan302", "revind.io/plan302", "revind.io/mojopindrawing"],
    ["https://pixpills.com/seosung", "pixpills.com/seosung/", "https://pixpills.com/dawnitive.wave/"],
    ["https://blog.naver.com/gionharo_eu", "https://blog.naver.com/PostView.naver?blogId=gionharo_eu&logNo=1", "https://blog.naver.com/other_id"],
    ["https://smartstore.naver.com/brand_a", "https://smartstore.naver.com/brand_a/products/123", "https://smartstore.naver.com/brand_b"],
    ["https://www.idus.com/w/artist/abc-123", "https://idus.com/w/artist/abc-123/product", "https://www.idus.com/w/artist/def-456"],
    ["https://tumblbug.com/projecta", "https://tumblbug.com/projecta/story", "https://tumblbug.com/projectb"],
    [
      "https://comic.naver.com/webtoon/list?titleId=841876&tab=sun",
      "https://m.comic.naver.com/webtoon/list?titleId=841876",
      "https://comic.naver.com/webtoon/list?titleId=827328&week=thu",
    ],
    ["https://www.facebook.com/profile.php?id=100", "https://facebook.com/profile.php?id=100&sk=about", "https://www.facebook.com/profile.php?id=200"],
  ];
  it.each(pairs)("%s — 같은 계정은 같고 다른 계정은 다르다", (a, same, other) => {
    expect(k(a)).toBeTruthy();
    expect(k(same)).toBe(k(a));
    expect(k(other)).toBeTruthy();
    expect(k(other)).not.toBe(k(a));
  });

  it("계정을 못 뽑는 주소는 신원 근거가 아니다(호스트로 떨어뜨리지 않는다)", () => {
    for (const u of [
      "https://link.inpock.co.kr",
      "https://instabio.cc/",
      "https://grafolio.ogq.me/",
      "https://marpple.shop/kr/@/popup-store/1266",
      "https://www.youtube.com/watch?v=n47xbgAF3rc",
      "https://youtu.be/n47xbgAF3rc",
      "https://twenty.style/",
      "https://www.instagram.com/p/Cabc123/",
      "https://xhslink.com/m/3pSCKubsyFY",
      "https://idus.kr/KBPDU",
      "https://airbridge.tumblbug.com/wz8lv2",
      "https://product.kyobobook.co.kr/detail/S000220573808",
      "https://m.yes24.com/goods/detail/194475005",
      "https://m.comic.naver.com/bestChallenge/list",
      "https://blog.naver.com/PostView.naver?logNo=1",
    ]) {
      expect(anchorKey(u), u).toBeNull();
    }
  });

  it("계정 키는 원래 주소 안에 그대로 들어 있다(품질 게이트가 근거 주소에서 찾는다)", () => {
    for (const u of [
      "https://www.youtube.com/channel/UCfeDBrN_zGk0hTGB1tc2a8g/featured",
      "https://marpple.shop/kr/heavenfall",
      "https://grafolio.ogq.me/profile/%EB%AC%B4%EC%9A%B4mouun/projects",
      "https://www.threads.net/@yifuu.0u",
    ]) {
      expect(u.toLowerCase()).toContain(k(u));
    }
  });

  it("한글 계정은 메시지에서 읽을 수 있게 보인다", () => {
    expect(anchorKey("https://grafolio.ogq.me/profile/%EB%AC%B4%EC%9A%B4mouun/projects")?.label).toBe(
      "grafolio.ogq.me/profile/무운mouun",
    );
  });
});
