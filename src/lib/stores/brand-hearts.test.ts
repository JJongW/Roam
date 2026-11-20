import { beforeEach, describe, expect, it, vi } from "vitest";

const put = vi.fn();
const del = vi.fn();
const get = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: { put: (...a: unknown[]) => put(...a), del: (...a: unknown[]) => del(...a), get: (...a: unknown[]) => get(...a) },
}));

import {
  BRAND_HEART_STORAGE_KEY,
  clearBrandHearts,
  isBrandHearted,
  loadBrandHearts,
  pushBrandHeart,
  setBrandHeart,
  syncBrandHearts,
  useBrandHeartStore,
} from "./brand-hearts";

function saved() {
  return JSON.parse(localStorage.getItem(BRAND_HEART_STORAGE_KEY) ?? "{}");
}

beforeEach(() => {
  localStorage.clear();
  useBrandHeartStore.setState({ hearts: {}, pending: {}, loaded: false });
  put.mockReset();
  del.mockReset();
  get.mockReset();
});

describe("브랜드 하트 기기 저장(UI 19)", () => {
  it("로그인 전에도 이 브라우저에 남기고, 계정에 올릴 일을 적어 둔다", () => {
    expect(setBrandHeart("ex-1", true)).toBe(true);
    expect(isBrandHearted("ex-1")).toBe(true);
    expect(saved().pending).toEqual({ "ex-1": "add" });
  });

  it("새로 읽어도 남아 있다", () => {
    setBrandHeart("ex-1", true);
    useBrandHeartStore.setState({ hearts: {}, pending: {}, loaded: false });
    loadBrandHearts();
    expect(isBrandHearted("ex-1")).toBe(true);
  });

  it("브라우저에 못 쓰면 남겼다고 하지 않는다(19-A5)", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    expect(setBrandHeart("ex-1", true)).toBe(false);
    expect(isBrandHearted("ex-1")).toBe(false);
    spy.mockRestore();
  });

  it("로그인한 분의 누름은 바로 계정에 올리고, 성공하면 적어 둔 일을 지운다", async () => {
    put.mockResolvedValue({});
    setBrandHeart("ex-1", true);
    expect(await pushBrandHeart("ex-1")).toBe(true);
    expect(put).toHaveBeenCalledWith("/api/me/brand-hearts/ex-1");
    expect(saved().pending).toEqual({});
  });

  it("올리기에 실패하면 적어 둔 일이 남는다", async () => {
    del.mockRejectedValue(new Error("offline"));
    setBrandHeart("ex-1", false);
    expect(await pushBrandHeart("ex-1")).toBe(false);
    expect(saved().pending).toEqual({ "ex-1": "remove" });
  });

  it("로그인하면 뺀 것은 빼고, 남긴 것은 한 번에 올리고, 계정 목록으로 맞춘다", async () => {
    setBrandHeart("ex-add", true);
    setBrandHeart("ex-gone", false);
    put.mockResolvedValue({ unknown: [] });
    del.mockResolvedValue(undefined);
    get.mockResolvedValue({
      data: [
        { exhibitorId: "ex-add", heartedAt: "2026-11-20T00:00:00Z" },
        { exhibitorId: "ex-server", heartedAt: "2026-11-01T00:00:00Z" },
      ],
    });
    expect(await syncBrandHearts()).toBe(true);
    expect(del).toHaveBeenCalledWith("/api/me/brand-hearts/ex-gone");
    expect(put).toHaveBeenCalledWith("/api/me/brand-hearts", { exhibitorIds: ["ex-add"] });
    expect(Object.keys(useBrandHeartStore.getState().hearts).sort()).toEqual(["ex-add", "ex-server"]);
    expect(saved().pending).toEqual({});
  });

  it("서버가 모르는 브랜드는 기기에서도 내린다", async () => {
    setBrandHeart("ex-x", true);
    put.mockResolvedValue({ unknown: ["ex-x"] });
    get.mockRejectedValue(new Error("down"));
    await syncBrandHearts();
    expect(isBrandHearted("ex-x")).toBe(false);
  });

  it("올릴 것이 없으면 맞추기 결과는 false", async () => {
    get.mockResolvedValue({ data: [] });
    expect(await syncBrandHearts()).toBe(false);
    expect(put).not.toHaveBeenCalled();
  });

  it("로그아웃하면 부스 기록처럼 비운다", () => {
    setBrandHeart("ex-1", true);
    clearBrandHearts();
    expect(isBrandHearted("ex-1")).toBe(false);
    expect(localStorage.getItem(BRAND_HEART_STORAGE_KEY)).toBeNull();
  });
});
