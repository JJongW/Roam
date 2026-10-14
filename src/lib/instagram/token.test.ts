import { describe, expect, it, vi } from "vitest";
import { loadIgToken, refreshIgToken, type StoredToken, type TokenStore } from "./token";

function memStore(initial: StoredToken | null = null) {
  let row = initial;
  const store: TokenStore & { row: () => StoredToken | null } = {
    read: async () => row,
    write: async (t) => {
      row = t;
    },
    row: () => row,
  };
  return store;
}

const graphOk = (token: string) =>
  vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ access_token: token, expires_in: 5_184_000 }), { status: 200 }));

const now = new Date("2026-10-14T00:00:00Z");

describe("refreshIgToken", () => {
  it("저장된 게 없으면 env 토큰으로 갱신해 저장한다", async () => {
    const store = memStore();
    const fetchImpl = graphOk("new");
    const r = await refreshIgToken(store, "env-token", { now, fetchImpl });
    expect(r).toEqual({ status: "refreshed", expiresAt: "2026-12-13T00:00:00.000Z" });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("access_token=env-token");
    expect(store.row()?.accessToken).toBe("new");
  });

  it("7일 안에 갱신했으면 부르지 않는다", async () => {
    const store = memStore({ accessToken: "a", refreshedAt: "2026-10-10T00:00:00Z" });
    const fetchImpl = graphOk("new");
    expect((await refreshIgToken(store, "env", { now, fetchImpl })).status).toBe("fresh");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("오래됐으면 저장된 토큰(env 아님)으로 갱신한다", async () => {
    const store = memStore({ accessToken: "stored", refreshedAt: "2026-10-01T00:00:00Z" });
    const fetchImpl = graphOk("new");
    await refreshIgToken(store, "env", { now, fetchImpl });
    expect(String(fetchImpl.mock.calls[0][0])).toContain("access_token=stored");
  });

  it("실패하면 throw하고 저장값을 건드리지 않는다 — 에러에 토큰이 없다", async () => {
    const store = memStore({ accessToken: "secret-tok", refreshedAt: "2026-10-01T00:00:00Z" });
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: "expired", code: 190 } }), { status: 400 }),
    );
    const err = await refreshIgToken(store, undefined, { now, fetchImpl }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain("secret-tok");
    expect(store.row()?.accessToken).toBe("secret-tok");
  });

  it("토큰이 아예 없으면 no-token", async () => {
    expect(await refreshIgToken(memStore(), undefined, { now, fetchImpl: graphOk("x") })).toEqual({ status: "no-token" });
  });
});

describe("loadIgToken", () => {
  it("저장된 토큰 > env", async () => {
    expect(await loadIgToken(memStore({ accessToken: "s", refreshedAt: "" }), "env")).toBe("s");
    expect(await loadIgToken(memStore(), "env")).toBe("env");
  });
  it("저장소를 못 읽으면 env로", async () => {
    const broken: TokenStore = { read: async () => Promise.reject(new Error("no table")), write: async () => {} };
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await loadIgToken(broken, "env")).toBe("env");
  });
});
