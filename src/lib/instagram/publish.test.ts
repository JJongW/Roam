import { describe, expect, it, vi } from "vitest";
import { countHashtags, isJpeg, prepareCarousel, publishCarousel, validateCarousel } from "./publish";
import { runPublishCli, toSlug, type CliDeps } from "./publish-cli";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

/** Graph API 목. 경로·메서드별 응답을 순서대로 돌려주고 호출을 기록한다. */
function graph(statuses: string[] = ["FINISHED"]) {
  const calls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
  let n = 0;
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const path = String(url).replace(/^https:\/\/graph\.instagram\.com\/v[\d.]+\//, "");
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? "GET", path, body });
    let json: Record<string, unknown>;
    if (path.endsWith("/media_publish")) json = { id: "MEDIA1" };
    else if (path.endsWith("/media")) json = { id: body?.media_type === "CAROUSEL" ? "CAROUSEL1" : `ITEM${++n}` };
    else if (path.includes("fields=status_code")) json = { status_code: statuses.shift() ?? "FINISHED" };
    else if (path.includes("fields=permalink")) json = { permalink: "https://www.instagram.com/p/abc/" };
    else json = {};
    return new Response(JSON.stringify(json), { status: 200 });
  });
  return { calls, fetchMock };
}

const cfg = (f: typeof fetch) => ({ token: "t", igUserId: "me", fetch: f, sleep: async () => {}, pollIntervalMs: 1000, timeoutMs: 3000 });

describe("validateCarousel", () => {
  it("장 수·캡션 길이·해시태그 수를 검사한다", () => {
    expect(validateCarousel({ imageCount: 9, caption: "안녕 #a #b" })).toEqual([]);
    expect(validateCarousel({ imageCount: 1, caption: "" })[0]).toContain("2~10장");
    expect(validateCarousel({ imageCount: 11, caption: "" })[0]).toContain("2~10장");
    expect(validateCarousel({ imageCount: 2, caption: "가".repeat(2201) })[0]).toContain("2201자");
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`).join(" ");
    expect(validateCarousel({ imageCount: 2, caption: tags })[0]).toContain("31개");
  });
  it("해시태그와 JPEG를 센다", () => {
    expect(countHashtags("#디자인 #DDP 글 #x#y")).toBe(4);
    expect(isJpeg(JPEG)).toBe(true);
    expect(isJpeg(PNG)).toBe(false);
  });
});

describe("publishCarousel", () => {
  it("장별 컨테이너 → 캐러셀 → 상태 확인 → 게시 순으로 부른다", async () => {
    const { calls, fetchMock } = graph(["IN_PROGRESS", "FINISHED"]);
    const res = await publishCarousel({ imageUrls: ["u1", "u2"], caption: "캡션", locationId: "L1" }, cfg(fetchMock as unknown as typeof fetch));
    expect(res).toEqual({ mediaId: "MEDIA1", permalink: "https://www.instagram.com/p/abc/" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "POST me/media",
      "POST me/media",
      "POST me/media",
      "GET CAROUSEL1?fields=status_code",
      "GET CAROUSEL1?fields=status_code",
      "POST me/media_publish",
      "GET MEDIA1?fields=permalink",
    ]);
    expect(calls[0].body).toEqual({ image_url: "u1", is_carousel_item: true });
    expect(calls[2].body).toEqual({ media_type: "CAROUSEL", children: "ITEM1,ITEM2", caption: "캡션", location_id: "L1" });
    expect(calls[5].body).toEqual({ creation_id: "CAROUSEL1" });
    // 토큰은 헤더로만 간다(URL에 싣지 않는다).
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer t");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("access_token");
  });

  it("컨테이너가 ERROR면 게시하지 않고 멈춘다", async () => {
    const { calls, fetchMock } = graph(["ERROR"]);
    await expect(publishCarousel({ imageUrls: ["u1", "u2"], caption: "" }, cfg(fetchMock as unknown as typeof fetch))).rejects.toThrow("ERROR");
    expect(calls.some((c) => c.path.endsWith("media_publish"))).toBe(false);
  });

  it("준비가 상한을 넘기면 멈춘다", async () => {
    const { fetchMock } = graph(Array(10).fill("IN_PROGRESS"));
    await expect(publishCarousel({ imageUrls: ["u1", "u2"], caption: "" }, cfg(fetchMock as unknown as typeof fetch))).rejects.toThrow("3초");
  });

  it("API 오류 메시지를 그대로 올린다", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { message: "권한 없음", code: 10 } }), { status: 403 }));
    await expect(publishCarousel({ imageUrls: ["u1", "u2"], caption: "" }, cfg(f as unknown as typeof fetch))).rejects.toThrow("Instagram API 403: 권한 없음 (code 10)");
  });

  it("prepareCarousel은 FINISHED까지만 가고 게시하지 않는다", async () => {
    const { calls, fetchMock } = graph(["IN_PROGRESS", "FINISHED"]);
    const res = await prepareCarousel({ imageUrls: ["u1", "u2"], caption: "캡션" }, cfg(fetchMock as unknown as typeof fetch));
    expect(res).toEqual({ creationId: "CAROUSEL1", itemCount: 2 });
    expect(calls.some((c) => c.path.endsWith("media_publish"))).toBe(false);
  });

  it("검사에 걸리면 API를 부르지 않는다", async () => {
    const { fetchMock } = graph();
    await expect(publishCarousel({ imageUrls: ["u1"], caption: "" }, cfg(fetchMock as unknown as typeof fetch))).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function cliDeps(files: Record<string, Uint8Array>, over: Partial<CliDeps> = {}) {
  const lines: string[] = [];
  const deps = {
    listDir: vi.fn(async () => Object.keys(files)),
    readFile: vi.fn(async (p: string) => files[p.split("/").pop()!]),
    readText: vi.fn(async () => "캡션 #DDP\n"),
    upload: vi.fn(async (key: string) => `https://cdn/${key}`),
    publish: vi.fn(async () => ({ mediaId: "M", permalink: "https://www.instagram.com/p/x/" })),
    prepare: vi.fn(async () => ({ creationId: "C1", itemCount: 2 })),
    confirm: vi.fn(async () => true),
    out: (l: string) => lines.push(l),
    today: () => "2026-10-14",
    ...over,
  } satisfies CliDeps;
  return { deps, lines };
}

describe("runPublishCli", () => {
  const two = { "02.jpg": JPEG, "01.jpg": JPEG, "notes.txt": JPEG };

  it("기본은 드라이런 — 업로드도 게시도 하지 않는다", async () => {
    const { deps, lines } = cliDeps(two);
    expect(await runPublishCli(["--dir", "out/08", "--caption", "c.txt"], deps)).toBe(0);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("드라이런");
    // 이미지 아닌 파일은 빼고 이름순으로 센다.
    expect(lines[0]).toBe("이미지 2장");
    expect(lines[1]).toContain("01.jpg");
  });

  it("PNG가 섞이면 게시하지 않고 JPG 내보내기를 안내한다", async () => {
    const { deps, lines } = cliDeps({ "01.png": PNG, "02.jpg": JPEG });
    expect(await runPublishCli(["--dir", "d", "--caption", "c", "--publish", "--yes"], deps)).toBe(1);
    expect(deps.upload).not.toHaveBeenCalled();
    expect(lines.join("\n")).toContain("JPG로 내보내");
  });

  it("--publish는 확인을 받고, 거절하면 아무것도 올리지 않는다", async () => {
    const { deps } = cliDeps(two, { confirm: vi.fn(async () => false) });
    expect(await runPublishCli(["--dir", "d", "--caption", "c", "--publish"], deps)).toBe(1);
    expect(deps.confirm).toHaveBeenCalledOnce();
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("--publish --yes는 순서대로 올리고 게시한다", async () => {
    const { deps } = cliDeps(two);
    expect(await runPublishCli(["--dir", "out/카드08", "--caption", "c", "--publish", "--yes", "--slug", "SDW 08"], deps)).toBe(0);
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(vi.mocked(deps.upload).mock.calls.map((c) => c[0])).toEqual(["2026-10-14-sdw-08/01.jpg", "2026-10-14-sdw-08/02.jpg"]);
    expect(deps.publish).toHaveBeenCalledWith({
      imageUrls: ["https://cdn/2026-10-14-sdw-08/01.jpg", "https://cdn/2026-10-14-sdw-08/02.jpg"],
      caption: "캡션 #DDP",
      locationId: undefined,
    });
  });

  it("--check는 확인 없이 올리고 준비까지만 한다 — 게시하지 않는다", async () => {
    const { deps, lines } = cliDeps(two);
    expect(await runPublishCli(["--dir", "d", "--caption", "c", "--check"], deps)).toBe(0);
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(deps.upload).toHaveBeenCalledTimes(2);
    expect(deps.prepare).toHaveBeenCalledOnce();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(lines.at(-1)).toContain("게시하지 않았고");
  });

  it("--check와 --publish를 같이 주면 아무것도 하지 않는다", async () => {
    const { deps } = cliDeps(two);
    expect(await runPublishCli(["--dir", "d", "--caption", "c", "--check", "--publish", "--yes"], deps)).toBe(1);
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("슬러그는 영문·숫자만 남긴다", () => {
    expect(toSlug("카드08 SDW")).toBe("08-sdw");
    expect(toSlug("카드뉴스")).toBe("post");
  });
});
