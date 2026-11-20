"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LOGIN_STARTED_KEY, useAuthStore } from "@/lib/stores/auth";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import { LoginPanel } from "@/components/auth/login-panel";
import { system } from "@/lib/copy/v1";

/**
 * UI 5-04 로그인 시트, 5-07 로그인이 안 됐을 때(Figma 2995:3394, 2995:3878).
 * 하트, 브랜드 하트, 회고, 마이페이지, API 오류 화면에서 로그인을 부르면 페이지를 옮기지 않고 지금 화면 위에
 * 올라온다(11-20 Ted). `useAuthStore.openLogin(source)`로 연다. 내용은 `/login` 페이지와 같은 `LoginPanel`.
 * - 바깥을 누르거나 Esc, "로그인 없이 둘러보기"로 닫으면 화면은 그대로다(5-06).
 * - Google은 다른 사이트를 돌아오므로, 실패하면 auth/callback이 이 화면으로 돌려보내고 AuthBootstrap이 시트를 5-07로 다시 연다.
 */
export function LoginSheet() {
  const open = useAuthStore((s) => s.loginOpen);
  const source = useAuthStore((s) => s.loginSource);
  const returned = useAuthStore((s) => s.loginReturned);
  const closeLogin = useAuthStore((s) => s.closeLogin);
  const router = useRouter();
  const pathname = usePathname();
  // 로그인 페이지 자체에서는 시트를 겹치지 않는다.
  if (!open || pathname === "/login") return null;
  const next = window.location.pathname + window.location.search;
  return (
    <BottomSheet ariaLabel={system.loginSheetTitle.replace("\n", " ")} onClose={closeLogin}>
      <LoginPanel
        key={`${source}:${returned ?? ""}`}
        next={next}
        source={source}
        returned={returned}
        via="sheet"
        onSkip={closeLogin}
        onNicknameDone={() => {
          closeLogin();
          // 서버 화면(홈 머리 종 등)이 새 쿠키로 다시 그려지게 한다.
          router.refresh();
        }}
      />
    </BottomSheet>
  );
}

/** 로그인을 시작한 자리(markLoginStarted). 지우지 않고 읽기만 한다 — LoginPanel이 열리며 지운다. */
function loginStartedSource(): string | null {
  try {
    return sessionStorage.getItem(LOGIN_STARTED_KEY);
  } catch {
    return null;
  }
}

/** Mounts once near the app root: runs the initial session check. */
export function AuthBootstrap() {
  const refresh = useAuthStore((s) => s.refresh);
  useEffect(() => {
    void refresh();
    // Surface an OAuth failure bounced back from /auth/callback, then strip the
    // query param so a reload doesn't re-toast.
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("login_error");
    if (reason) {
      // 이유를 반드시 콘솔에 남긴다 — 토스트 문구만으로는 어디서 깨졌는지 알 수 없고,
      // 아래에서 쿼리 파라미터를 지우므로 여기서 안 찍으면 단서가 통째로 사라진다.
      console.error("[login] OAuth 실패", {
        reason,
        detail: params.get("login_detail"),
      });
      // /login은 화면 자체가 5-07(로그인을 마치지 못했어요)로 바뀐다. 다른 화면이면 시트에서 로그인을 시작했다가
      // 돌아온 것이라 같은 시트를 다시 연다: 취소(denied)는 5-04 그대로, 그 밖은 5-07(Figma 5-04 상태 규칙).
      if (window.location.pathname !== "/login")
        useAuthStore.getState().openLogin(loginStartedSource() ?? "sheet", reason);
      params.delete("login_error");
      params.delete("login_detail");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, [refresh]);
  return null;
}
