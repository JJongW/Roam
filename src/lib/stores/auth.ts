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
      if (user) await loadNotes();
      else useVisitStore.getState().clear();
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
