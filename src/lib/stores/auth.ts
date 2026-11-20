"use client";

import { create } from "zustand";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { clearBrandHearts, syncBrandHearts } from "@/lib/stores/brand-hearts";
import { clearSessionState } from "@/lib/hooks/use-session-state";
import {
  APP_ONBOARDING_DISMISS_KEY,
  onboardingDismissOwner,
  APP_ONBOARDING_GUIDE_STEP_KEY,
  APP_ONBOARDING_PHASE_KEY,
} from "@/lib/onboarding/app-onboarding-gate";
import { system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { BoothNote, User } from "@/lib/types";

interface AuthState {
  user: User | null;
  /** false until the initial /api/auth/me check resolves. */
  ready: boolean;
  /** 지금 화면 위 로그인 시트(UI 5-04, 5-07, `LoginSheet`)가 열렸는지. */
  loginOpen: boolean;
  /** 시트를 부른 자리(이벤트 props.source). */
  loginSource: string;
  /** Google에서 실패하고 돌아와 다시 연 시트면 그 이유(`login_error`). 있으면 5-07(취소 denied는 5-04). */
  loginReturned: string | null;
  /** 로그인 계정에 아직 취향(브레인 관심)이 없으면 true — 앱 온보딩을 다시 띄울지
   *  판정하는 서버 신호(AppOnboardingGate가 씀). 비로그인은 이 값 대신
   *  localStorage로 따로 판정한다(계정이 없어 서버에 물을 게 없음). */
  needsOnboarding: boolean;
  setNeedsOnboarding: (v: boolean) => void;
  /** 앱 최초진입 온보딩을 이 브라우저에서 껐는지(완료든 건너뛰기든) — localStorage
   *  기반, AppOnboardingGate가 구독한다. */
  /** localStorage에 남은 "누가 껐는가" — "anon" | app_user.id | 옛 "1" | null. */
  onboardingDismissedBy: string | null;
  dismissAppOnboarding: () => void;
  /** 닉네임 버튼(계정 시트)에서 "온보딩 다시 하기" — 로컬 dismiss를 풀고 서버
   *  신호(needsOnboarding)도 다시 세워 AppOnboardingGate가 처음부터 다시 뜨게 한다. */
  restartAppOnboarding: () => void;
  /** 페이지 이동 없이 지금 화면 위에 로그인 시트를 띄운다. */
  openLogin: (source?: string, returned?: string | null) => void;
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
 *  않는다).
 *
 *  로그인 중에 네트워크가 끊겨도 같은 상태가 된다 — 그때 pushNote가 실패하며
 *  hasPendingSync를 켜는데, 예전엔 **다시 로그인할 때만** 이걸 재시도했다. 이미
 *  로그인한 사람은 다시 로그인할 일이 없으니, 끊긴 동안 누른 반응이 그 기기의
 *  localStorage에만 영원히 남았다. 그래서 연결이 돌아올 때도 부른다
 *  (connection-banner.tsx). */
export async function syncPendingReactions(): Promise<boolean> {
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

/** 온보딩 답변 + 부스 반응을 함께 소급 반영하고, 뭔가 반영됐으면 완료 토스트를
 *  한 번 띄운다. login()과 refresh()(OAuth 콜백 포함) 양쪽에서 호출한다.
 *  전시별 가치 온보딩(ValueOnboarding)은 로그인 사용자에게만 뜨므로(비로그인은
 *  결과가 계정에 안 남아 약속을 못 지켜 아예 숨긴다) 그쪽의 소급 동기화는 없다 —
 *  앱 최초진입 온보딩(PENDING_VALUES_KEY)만 비로그인 경로가 있다. */
/**
 * 로그인 화면(UI 5-04)에서 로그인을 시작했다는 표시. Google 로그인은 다른 사이트를 돌아 이 앱으로 다시 들어오므로
 * 화면 상태로는 "방금 로그인했다"를 알 수 없다. 탭 단위(sessionStorage)로 남기고, 돌아와 로그인이 확인되면
 * 5-05 "로그인했어요. 남긴 하트는 그대로 있어요."를 한 번 띄운다.
 */
export const LOGIN_STARTED_KEY = "roam.login.started";
export function markLoginStarted(source: string) {
  try {
    sessionStorage.setItem(LOGIN_STARTED_KEY, source || "login");
  } catch {
    /* 사생활 보호 모드 등 — 알림만 빠진다 */
  }
}
/** 로그인이 실패하거나 취소돼 돌아오면 표시를 지운다(다음 로그인 확인 때 엉뚱하게 5-05가 뜨지 않게). */
export function clearLoginStarted() {
  try {
    sessionStorage.removeItem(LOGIN_STARTED_KEY);
  } catch {
    /* 무시 */
  }
}
function takeLoginStarted(): string | null {
  try {
    const v = sessionStorage.getItem(LOGIN_STARTED_KEY);
    if (v) sessionStorage.removeItem(LOGIN_STARTED_KEY);
    return v;
  } catch {
    return null;
  }
}

async function syncAndAnnounce() {
  const started = typeof window === "undefined" ? null : takeLoginStarted();
  const [syncedValues, syncedReactions, syncedBrandHearts] = await Promise.all([
    syncPendingValues(),
    syncPendingReactions(),
    // 브랜드 하트(UI 19)도 부스 하트와 같은 때 계정과 맞춘다(stores/brand-hearts.ts).
    syncBrandHearts(),
  ]);
  if (started) {
    // 5-05. 옛 "아까 남기신 반응도 반영했어요" 알림과 겹치지 않게 이것 하나만 띄운다.
    toast(system.loggedIn);
    track("login_complete", {
      screen: SCREEN.loginSheet,
      props: { source: started, local_synced: syncedReactions },
    });
  } else if (syncedValues || syncedReactions || syncedBrandHearts) {
    toast("아까 남기신 반응도 반영했어요. 이제 박람회를 옮겨도 이어서 골라 드릴게요.");
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  ready: false,
  loginOpen: false,
  loginSource: "sheet",
  loginReturned: null,
  needsOnboarding: false,
  setNeedsOnboarding: (v) => set({ needsOnboarding: v }),
  onboardingDismissedBy:
    typeof window === "undefined"
      ? null
      : localStorage.getItem(APP_ONBOARDING_DISMISS_KEY),
  // 끈 사람을 같이 남긴다 — 비로그인으로 끈 기록은 로그인하는 순간 효력을
  // 잃어야 온보딩이 계정에 붙는다(app-onboarding-gate.ts 주석 참고).
  dismissAppOnboarding: () => {
    const owner = onboardingDismissOwner(get().user?.id);
    if (typeof window !== "undefined") {
      localStorage.setItem(APP_ONBOARDING_DISMISS_KEY, owner);
    }
    clearSessionState(APP_ONBOARDING_PHASE_KEY, APP_ONBOARDING_GUIDE_STEP_KEY);
    set({ onboardingDismissedBy: owner });
  },
  restartAppOnboarding: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(APP_ONBOARDING_DISMISS_KEY);
    }
    clearSessionState(APP_ONBOARDING_PHASE_KEY, APP_ONBOARDING_GUIDE_STEP_KEY);
    set({ onboardingDismissedBy: null, needsOnboarding: true });
  },
  openLogin: (source = "sheet", returned = null) =>
    set({ loginOpen: true, loginSource: source, loginReturned: returned }),
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
    clearBrandHearts();
  },
}));

/**
 * Gate for signed-in-only actions (save / share / bookmark). Instead of
 * silently failing or jumping straight into the login sheet, surface a toast
 * that explains why and offers a one-tap path to the login screen.
 */
export function promptLogin(message = "로그인이 필요해요", description?: string) {
  toast(message, {
    description,
    action: {
      label: "로그인",
      onClick: () => useAuthStore.getState().openLogin("toast"),
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
  promptLogin(
    "누르신 반응은 지금 이 기기에 남아 있어요. 로그인하면 다른 박람회에서도 이어서 기억할게요",
  );
}
