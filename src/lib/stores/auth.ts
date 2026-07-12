"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useVisitStore } from "@/lib/stores/visit";
import type { BoothNote, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  /** false until the initial /api/auth/me check resolves. */
  ready: boolean;
  /** Controls the global login sheet. */
  loginOpen: boolean;
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

/** 로그인 전 공개 온보딩에서 고른 취향(localStorage)을 로그인 시 브레인에 올린다. */
export const PENDING_VALUES_KEY = "roam-pending-values";
async function syncPendingValues() {
  if (typeof window === "undefined") return;
  const raw = localStorage.getItem(PENDING_VALUES_KEY);
  if (!raw) return;
  localStorage.removeItem(PENDING_VALUES_KEY);
  try {
    const values = JSON.parse(raw);
    if (Array.isArray(values) && values.length)
      await api.post("/api/me/values", { values });
  } catch {
    /* 실패해도 무시 — 관람 반응으로 다시 쌓인다 */
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  ready: false,
  loginOpen: false,
  openLogin: () => set({ loginOpen: true }),
  closeLogin: () => set({ loginOpen: false }),

  refresh: async () => {
    try {
      const { user } = await api.get<{ user: User | null }>("/api/auth/me");
      set({ user, ready: true });
      // Signed in → merge the server's notes on top. Signed out → keep whatever
      // is in the local cache: anonymous visitors save memos/visits locally and
      // must not lose them on reload. Only an explicit logout clears.
      if (user) {
        await syncPendingValues();
        await loadNotes();
      }
    } catch {
      set({ ready: true });
    }
  },

  login: async (nickname: string) => {
    try {
      const { user } = await api.post<{ user: User }>("/api/auth/login", {
        nickname,
      });
      set({ user, loginOpen: false });
      await syncPendingValues();
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
    set({ user: null });
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
