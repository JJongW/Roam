import { describe, expect, it } from "vitest";
import { ROAM_BOT_UA, createPoliteFetcher, parseRobots, robotsAllows } from "./polite-fetch";
import { mayFetch } from "./draft";

describe("robots.txt", () => {
  const txt = `
User-agent: *
Disallow: /private
Allow: /private/about

User-agent: RoamBot
Disallow: /shop
`;
  it("우리 이름 그룹이 있으면 그것만 본다", () => {
    const r = parseRobots(txt);
    expect(r).toEqual({ allow: [], disallow: ["/shop"] });
    expect(robotsAllows(r, "/shop/1")).toBe(false);
    expect(robotsAllows(r, "/private")).toBe(true);
  });
  it("없으면 * 그룹, 가장 길게 맞는 규칙이 이긴다", () => {
    const r = parseRobots(txt, "OtherBot");
    expect(robotsAllows(r, "/private/x")).toBe(false);
    expect(robotsAllows(r, "/private/about")).toBe(true);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /"), "/")).toBe(false);
    expect(robotsAllows(parseRobots(""), "/anything")).toBe(true);
  });
});

function fakeFetch(routes: Record<string, { status: number; body: string; type?: string }>) {
  const calls: { url: string; ua: string | null }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, ua: new Headers(init?.headers).get("user-agent") });
    const r = routes[url];
    if (!r) return new Response("", { status: 404 });
    return new Response(r.body, { status: r.status, headers: { "content-type": r.type ?? "text/html" } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("createPoliteFetcher", () => {
  it("robots를 먼저 보고, 같은 호스트엔 간격을 두고, UA를 밝힌다", async () => {
    const { impl, calls } = fakeFetch({
      "https://brand.example/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /admin", type: "text/plain" },
      "https://brand.example/about": { status: 200, body: "<html><body><h1>소개</h1><script>x</script><p>직접 그려요</p></body></html>" },
      "https://brand.example/works": { status: 200, body: "<p>작품</p>" },
    });
    let clock = 0;
    const waits: number[] = [];
    const f = createPoliteFetcher({ fetchImpl: impl, minIntervalMs: 2000, now: () => clock, sleep: async (ms) => { waits.push(ms); clock += ms; } });
    expect((await f.text("https://brand.example/about")).text).toBe("소개 직접 그려요");
    expect((await f.text("https://brand.example/works")).text).toBe("작품");
    expect((await f.text("https://brand.example/admin/x")).reason).toBe("robots.txt가 막았어요");
    expect(calls.filter((c) => c.url.endsWith("robots.txt"))).toHaveLength(1); // 호스트마다 한 번
    expect(calls.every((c) => c.ua === ROAM_BOT_UA)).toBe(true);
    expect(waits.length).toBeGreaterThanOrEqual(2); // 같은 호스트 연속 요청 사이 대기
  });

  it("robots.txt가 없으면(404) 읽고, 서버 오류면 읽지 않는다", async () => {
    const ok = fakeFetch({ "https://a.example/": { status: 200, body: "<p>안녕</p>" } });
    expect((await createPoliteFetcher({ fetchImpl: ok.impl, minIntervalMs: 0 }).text("https://a.example/")).text).toBe("안녕");
    const bad = fakeFetch({ "https://b.example/robots.txt": { status: 503, body: "" }, "https://b.example/": { status: 200, body: "<p>x</p>" } });
    expect((await createPoliteFetcher({ fetchImpl: bad.impl, minIntervalMs: 0 }).text("https://b.example/")).text).toBeNull();
  });

  it("인스타와 판매 페이지는 요청 자체를 하지 않는다", async () => {
    const { impl, calls } = fakeFetch({});
    const f = createPoliteFetcher({ fetchImpl: impl, minIntervalMs: 0, allowUrl: mayFetch });
    expect((await f.text("https://www.instagram.com/a")).text).toBeNull();
    expect((await f.text("https://smartstore.naver.com/a")).text).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
