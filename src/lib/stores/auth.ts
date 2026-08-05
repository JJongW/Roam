"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import type { BoothNote, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  /** false until the initial /api/auth/me check resolves. */
  ready: boolean;
  /** Controls the global login sheet. */
  loginOpen: boolean;
  /** 로그인 계정에 아직 취향(브레인 관심)이 없으면 true — 앱 온보딩을 다시 띄울지
   *  판정하는 서버 신호(AppOnboardingGate가 씀). 비로그인은 이 값 대신
   *  localStorage로 따로 판정한다(계정이 없어 서버에 물을 게 없음). */
  needsOnboarding: boolean;
  setNeedsOnboarding: (v: boolean) => void;
  openLogin: () => void;
  closeLogin: () => void;
  refresh: () => Promise<void>;
  login: (nickname: string) => Promise<void>;
  logout: () => Promise<void>;
}

/** Pull the signed-in user's booth notes into the local visit cache. */
async function loadNotes() {
  try {
    const { data } = await api.get<{ data: BoothNote[] }>("/api/me/notes");
    useVisitStore.getState().setFromNotes(data);
  } catch {
    /* ignore — notes are non-critical */
  }
}

/** 로그인 전 공개 온보딩에서 고른 취향(localStorage)을 로그인 시 브레인에 올린다.
 *  반환값: 실제로 올릴 게 있었는지(소급 반영 완료 토스트 표시 여부 판단용). */
export const PENDING_VALUES_KEY = "roam-pending-values";
async function syncPendingValues(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(PENDING_VALUES_KEY);
  if (!raw) return false;
  localStorage.removeItem(PENDING_VALUES_KEY);
  try {
    const values = JSON.parse(raw);
    if (Array.isArray(values) && values.length) {
      await api.post("/api/me/values", { values });
      return true;
    }
  } catch {
    /* 실패해도 무시 — 관람 반응으로 다시 쌓인다 */
  }
  return false;
}

/** 비로그인 동안 로컬(zustand)에만 남아 있던 부스 반응을 로그인 시 서버에 소급
 *  반영한다. 반환값: 실제로 반영을 시도했는지(하나라도 실패해 남아있던 게 있었는지 —
 *  visit.ts의 hasPendingSync가 근거라, 이미 다 동기화된 상태에서 매번 재시도하지
 *  않는다). */
async function syncPendingReactions(): Promise<boolean> {
  if (!useVisitStore.getState().hasPendingSync) return false;
  const boothIds = Object.keys(useVisitStore.getState().records);
  if (boothIds.length === 0) {
    useVisitStore.getState().clearPendingSync();
    return false;
  }
  const results = await Promise.all(boothIds.map((id) => pushNote(id)));
  if (results.every((r) => r !== null)) {
    useVisitStore.getState().clearPendingSync();
  }
  return true;
}

/** 비로그인 상태로 완료한 전시별 관람 가치 온보딩(ValueOnboarding) 답변을 로그인 시
 *  브레인에 올린다. 앱 온보딩(PENDING_VALUES_KEY)과 별도 키를 쓴다 — 이쪽은
 *  exhibitionSlug가 같이 필요하다. */
export const PENDING_EXHIBITION_VALUES_KEY = "roam-pending-exhibition-values";
async function syncPendingExhibitionValues(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(PENDING_EXHIBITION_VALUES_KEY);
  if (!raw) return false;
  localStorage.removeItem(PENDING_EXHIBITION_VALUES_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.exhibitionSlug === "string" &&
      Array.isArray(parsed.values) &&
      parsed.values.length
    ) {
      await api.post("/api/me/values", {
        exhibitionSlug: parsed.exhibitionSlug,
        values: parsed.values,
      });
      return true;
    }
  } catch {
    /* 실패해도 무시 */
  }
  return false;
}

/** 온보딩 답변 + 부스 반응을 함께 소급 반영하고, 뭔가 반영됐으면 완료 토스트를
 *  한 번 띄운다. login()과 refresh()(OAuth 콜백 포함) 양쪽에서 호출한다. */
async function syncAndAnnounce() {
  const [syncedValues, syncedExhibitionValues, syncedReactions] =
    await Promise.all([
      syncPendingValues(),
      syncPendingExhibitionValues(),
      syncPendingReactions(),
    ]);
  if (syncedValues || syncedExhibitionValues || syncedReactions) {
    toast("아까 둘러본 것도 다 반영했어. 이제부터 제대로 골라줄게.");
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  ready: false,
  loginOpen: false,
  needsOnboarding: false,
  setNeedsOnboarding: (v) => set({ needsOnboarding: v }),
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),

  refresh: async () => {
    try {
      const { user, needsOnboarding } = await api.get<{
        user: User | null;
        needsOnboarding: boolean;
      }>("/api/auth/me");
      set({ user, ready: true, needsOnboarding });
      // Signed in → merge the server's notes on top. Signed out → keep whatever
      // is in the local cache: anonymous visitors save memos/visits locally and
      // must not lose them on reload. Only an explicit logout clears.
      if (user) {
        await syncAndAnnounce();
        await loadNotes();
      }
    } catch {
      set({ ready: true });
    }
  },

  login: async (nickname: string) => {
    try {
      const { user, needsOnboarding } = await api.post<{
        user: User;
        needsOnboarding: boolean;
      }>("/api/auth/login", { nickname });
      set({ user, loginOpen: false, needsOnboarding });
      await syncAndAnnounce();
      await loadNotes();
    } catch (e) {
      if (e instanceof ApiClientError) throw e;
      throw new ApiClientError(
        { code: "INTERNAL", message: "로그인에 실패했어요" },
        500,
      );
    }
  },

  logout: async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    set({ user: null, needsOnboarding: false });
    useVisitStore.getState().clear();
  },
}));

/**
 * Gate for signed-in-only actions (save / share / bookmark). Instead of
 * silently failing or jumping straight into the login sheet, surface a toast
 * that explains why and offers a one-tap path to the login screen.
 */
export function promptLogin(message = "로그인이 필요해요") {
  toast(message, {
    action: {
      label: "로그인",
      onClick: () => useAuthStore.getState().openLogin(),
    },
  });
}

/** 비로그인 반응에서 전시당(세션 기준) 첫 반응 1회만 저장 안내를 띄운다.
 *  sessionStorage라 탭을 닫으면 리셋된다 — 영구로 기억할 필요는 없다(다음 방문 때
 *  한 번 더 알려줘도 무해하다). */
export function promptLoginOncePerExhibition(exhibitionSlug: string) {
  if (typeof window === "undefined") return;
  const key = `roam-promptlogin-seen-${exhibitionSlug}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, "1");
  promptLogin("지금 누른 건 로미가 기억 못 해 — 로그인하면 이제부터 다 기억할게");
}
