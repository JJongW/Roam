"use client";

// 브랜드 하트(UI 19 A안, 2026-11-19 Ted "A로 가."). 부스 하트와 따로 저장한다(11-17 결정).
//
// - 웹 부스 하트(stores/visit.ts)와 같은 길: 로그인 전에는 이 브라우저(localStorage)에 먼저 남기고,
//   로그인하면 계정(`/api/me/brand-hearts`, PR #172)으로 올린다. 로그아웃하면 부스 기록처럼 비운다.
// - 브라우저 저장이 실패하면(사파리 개인 정보 보호 창, 저장 공간 가득) 남겼다고 보여 주지 않는다.
//   화면은 19-A5 실패 띠를 띄운다. 그래서 zustand persist(실패를 삼킨다)를 쓰지 않고 직접 쓴다.
// - 계정에 못 올린 것(오프라인, 로그인 전)은 `pending`에 남겨 다음 로그인이나 다음 누름 때 다시 올린다.
//   iOS BrandHeartStore(`roam.brandHeart.*`, `roam.brandHeartRemoved.*`)와 같은 규칙이다.
// - 서버에만 있는 하트를 기기 쪽 사정으로 지우지 않는다(서버 PUT은 합집합).

import { create } from "zustand";
import { api } from "@/lib/api/client";
import { isHearted, useVisitStore } from "@/lib/stores/visit";
import type { BrandHeartSource } from "@/lib/types";

export const BRAND_HEART_STORAGE_KEY = "roam-brand-hearts";

type PendingOp = "add" | "remove";

interface Saved {
  /** exhibitorId → 남긴 시각(ISO) */
  hearts: Record<string, string>;
  /** 계정에 아직 못 맞춘 것 */
  pending: Record<string, PendingOp>;
}

interface BrandHeartState extends Saved {
  loaded: boolean;
}

const EMPTY: Saved = { hearts: {}, pending: {} };

function read(): Saved {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(BRAND_HEART_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return {
      hearts: parsed.hearts && typeof parsed.hearts === "object" ? parsed.hearts : {},
      pending: parsed.pending && typeof parsed.pending === "object" ? parsed.pending : {},
    };
  } catch {
    return EMPTY;
  }
}

/** 브라우저에 쓴다. 실패하면 false(화면이 19-A5를 띄운다). */
function write(next: Saved): boolean {
  try {
    window.localStorage.setItem(BRAND_HEART_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export const useBrandHeartStore = create<BrandHeartState>(() => ({
  ...EMPTY,
  loaded: false,
}));

/** 처음 쓰는 화면에서 한 번 브라우저 값을 읽는다(서버 렌더와 첫 화면을 맞추려고 마운트 뒤에 부른다). */
export function loadBrandHearts() {
  if (useBrandHeartStore.getState().loaded) return;
  useBrandHeartStore.setState({ ...read(), loaded: true });
}

function commit(next: Saved): boolean {
  if (!write(next)) return false;
  useBrandHeartStore.setState({ ...next, loaded: true });
  return true;
}

function current(): Saved {
  const s = useBrandHeartStore.getState();
  return s.loaded ? { hearts: s.hearts, pending: s.pending } : read();
}

export function isBrandHearted(exhibitorId: string): boolean {
  return !!useBrandHeartStore.getState().hearts[exhibitorId];
}

/**
 * 기기에 브랜드 하트를 켜고 끈다. 계정에 올릴 일은 `pending`에 적는다.
 * 브라우저에 못 쓰면 아무것도 바꾸지 않고 false.
 */
export function setBrandHeart(exhibitorId: string, on: boolean, now = new Date()): boolean {
  const { hearts, pending } = current();
  const nextHearts = { ...hearts };
  if (on) nextHearts[exhibitorId] = hearts[exhibitorId] ?? now.toISOString();
  else delete nextHearts[exhibitorId];
  return commit({
    hearts: nextHearts,
    pending: { ...pending, [exhibitorId]: on ? "add" : "remove" },
  });
}

function settle(exhibitorId: string, op: PendingOp) {
  const { hearts, pending } = current();
  // 그사이 다시 눌렀으면 그 누름이 이긴다 — 같은 일일 때만 지운다.
  if (pending[exhibitorId] !== op) return;
  const rest = { ...pending };
  delete rest[exhibitorId];
  commit({ hearts, pending: rest });
}

/**
 * DELETE /api/me/brand-hearts/[exhibitorId] 응답(2026-11-24). 브랜드 하트를 빼면 서버가 그 브랜드 부스 하트도 끈다.
 * 옛 서버(204, 본문 없음)면 끈 부스가 없는 것으로 읽는다.
 */
export interface BrandHeartRemoval {
  removed: boolean;
  source: BrandHeartSource | null;
  unheartedBoothIds: string[];
}

/** 서버가 끈 부스 하트를 이 브라우저 부스 기록(stores/visit.ts)에도 끈다. 메모, 다녀왔어요는 그대로. */
function applyBoothUnhearts(boothIds: string[]) {
  const visit = useVisitStore.getState();
  for (const id of boothIds) if (isHearted(visit.records[id])) visit.setHeart(id, false);
}

async function push(exhibitorId: string): Promise<{ ok: boolean; removal?: BrandHeartRemoval }> {
  const op = current().pending[exhibitorId];
  if (!op) return { ok: true };
  const path = `/api/me/brand-hearts/${encodeURIComponent(exhibitorId)}`;
  try {
    let removal: BrandHeartRemoval | undefined;
    if (op === "add") await api.put(path);
    else {
      const res = await api.del<BrandHeartRemoval | undefined>(path);
      removal = {
        removed: res?.removed ?? true,
        source: res?.source ?? null,
        unheartedBoothIds: res?.unheartedBoothIds ?? [],
      };
      applyBoothUnhearts(removal.unheartedBoothIds);
    }
    settle(exhibitorId, op);
    return { ok: true, removal };
  } catch {
    return { ok: false };
  }
}

/** 로그인한 분의 한 번 누름을 계정에 올린다. 실패하면 pending에 남아 다음 맞추기 때 다시 간다. */
export async function pushBrandHeart(exhibitorId: string): Promise<boolean> {
  return (await push(exhibitorId)).ok;
}

/** 빼기를 올리고 서버가 끈 부스 하트까지 돌려준다(되돌리기용). 올리지 못했거나 빼기가 아니면 null. */
export async function pushBrandHeartRemoval(exhibitorId: string): Promise<BrandHeartRemoval | null> {
  return (await push(exhibitorId)).removal ?? null;
}

/**
 * 되돌리기: 빼기로 꺼진 부스 하트를 다시 켜고 브랜드 하트를 살린다.
 * - 부스 하트를 다시 켜면 서버가 브랜드 하트를 booth 출처로 다시 만든다(lib/brands/follow.ts).
 *   그래서 원래 booth 출처였으면 브랜드 하트 API를 따로 부르지 않는다(direct로 바뀌지 않게).
 * - 원래 direct였거나 끈 부스가 없었으면 브랜드 하트를 직접 다시 남긴다.
 * - 부스 쓰기는 하트만 보낸다(이 브라우저에 없는 메모를 빈 값으로 덮지 않게).
 * 브라우저에 못 쓰면 false.
 */
export async function restoreBrandHeart(exhibitorId: string, removal: BrandHeartRemoval): Promise<boolean> {
  const viaBooths = removal.source !== "direct" && removal.unheartedBoothIds.length > 0;
  if (viaBooths) {
    const { hearts, pending } = current();
    const rest = { ...pending };
    delete rest[exhibitorId];
    if (!commit({ hearts: { ...hearts, [exhibitorId]: hearts[exhibitorId] ?? new Date().toISOString() }, pending: rest }))
      return false;
  } else if (!setBrandHeart(exhibitorId, true)) return false;

  const visit = useVisitStore.getState();
  for (const id of removal.unheartedBoothIds) {
    visit.setHeart(id, true);
    try {
      await api.put(`/api/me/notes/${encodeURIComponent(id)}`, { heart: true });
    } catch {
      useVisitStore.getState().setPendingSync();
    }
  }
  if (!viaBooths) await pushBrandHeart(exhibitorId);
  return true;
}

interface BrandHeartViewLite {
  exhibitorId: string;
  heartedAt: string;
}

/**
 * 로그인 직후(그리고 연결이 돌아왔을 때) 기기와 계정을 맞춘다.
 * 1) 기기에서 뺀 것을 계정에서도 빼고 2) 기기에만 있는 것을 한 번에 올리고 3) 계정 목록을 받아 기기를 맞춘다.
 * 반환값: 올릴 것이 있었는지(완료 토스트 판단용).
 */
export async function syncBrandHearts(): Promise<boolean> {
  const start = current();
  const removes = Object.keys(start.pending).filter((id) => start.pending[id] === "remove");
  const adds = Object.keys(start.pending).filter((id) => start.pending[id] === "add");
  for (const id of removes) await pushBrandHeart(id);
  if (adds.length) {
    try {
      const res = await api.put<{ unknown?: string[] }>("/api/me/brand-hearts", {
        exhibitorIds: adds.slice(0, 500),
      });
      for (const id of adds) settle(id, "add");
      // 서버가 모르는 브랜드(지워졌거나 합쳐진 브랜드)는 기기에서도 내린다.
      if (res.unknown?.length) {
        const { hearts, pending } = current();
        const next = { ...hearts };
        for (const id of res.unknown) delete next[id];
        commit({ hearts: next, pending });
      }
    } catch {
      /* 다음에 다시 — pending 그대로 */
    }
  }
  try {
    const { data } = await api.get<{ data: BrandHeartViewLite[] }>("/api/me/brand-hearts");
    const { pending } = current();
    const hearts: Record<string, string> = {};
    for (const v of data) hearts[v.exhibitorId] = v.heartedAt;
    // 아직 못 맞춘 누름은 기기 쪽이 맞다.
    for (const [id, op] of Object.entries(pending)) {
      if (op === "add") hearts[id] = hearts[id] ?? new Date().toISOString();
      else delete hearts[id];
    }
    commit({ hearts, pending });
  } catch {
    /* 목록을 못 받아도 기기 값은 그대로 둔다 */
  }
  return adds.length + removes.length > 0;
}

/** 로그아웃: 부스 기록(useVisitStore.clear)과 같이 이 브라우저에서 비운다. */
export function clearBrandHearts() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(BRAND_HEART_STORAGE_KEY);
    } catch {
      /* 무시 */
    }
  }
  useBrandHeartStore.setState({ ...EMPTY, loaded: true });
}
