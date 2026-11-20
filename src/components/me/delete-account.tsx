"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, File, Heart, UserRound } from "lucide-react";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth";
import { useVisitStore } from "@/lib/stores/visit";
import { clearBrandHearts } from "@/lib/stores/brand-hearts";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { GroupLabel, InfoRow, MePage, PageTitle } from "./me-ui";

/**
 * 15-11 계정 삭제, 15-12 확인 창, 15-13 지운 뒤 홈과 토스트.
 * - DELETE /api/me가 계정의 하트, 기록, 평가, 메모, 브랜드 하트, 닉네임을 바로 지우고 쿠키를 지운다.
 *   그 뒤 이 브라우저에 남은 기록도 비운다(로그아웃과 같은 정리).
 * - Figma의 "지우기 전에 / 기록 내보내기"는 웹에 내보내기가 없어 두지 않는다.
 */
export function DeleteAccount() {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const closeAsk = useCallback(() => setAsk(false), []);

  useEffect(() => {
    track("screen_view", { screen: SCREEN.deleteAccount });
  }, []);
  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeAsk();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, closeAsk]);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.del("/api/me");
      track("account_delete", { screen: SCREEN.deleteAccount, props: { result: "ok" } });
      useAuthStore.setState({ user: null, needsOnboarding: false });
      useVisitStore.getState().clear();
      clearBrandHearts();
      toast(system.deleteDone);
      router.replace("/");
    } catch {
      track("account_delete", { screen: SCREEN.deleteAccount, props: { result: "failed" } });
      setAsk(false);
      toast(system.deleteFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <MePage
      back="/me/settings"
      bottom={
        <button
          type="button"
          onClick={() => setAsk(true)}
          className="flex h-v2-x13 w-full items-center justify-center rounded-v2-r3 bg-v2-bg-critical-solid text-v2-t5 font-v2-bold text-v2-fg-on-critical-solid active:bg-v2-bg-critical-solid-pressed"
        >
          {label.deleteAccountButton}
        </button>
      }
    >
      <PageTitle title={label.deleteAccount} />
      <div className="flex flex-col gap-v2-x1 px-v2-x4">
        <p className="whitespace-pre-line text-v2-t5 font-v2-medium">{system.deleteBody}</p>
        <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{system.deleteWarn}</p>
      </div>
      <GroupLabel>{label.disappears}</GroupLabel>
      <InfoRow icon={Heart} title={label.goneHearts} />
      <InfoRow icon={Check} title={label.goneVisits} />
      <InfoRow icon={File} title={label.memo} />
      <InfoRow icon={UserRound} title={label.nickname} />

      {ask && (
        // 15-12 확인 창
        <div
          role="alertdialog"
          aria-modal
          aria-labelledby="delete-ask"
          className="fixed inset-0 z-50 flex items-center justify-center px-v2-x12"
        >
          <button
            type="button"
            aria-label={label.close}
            onClick={closeAsk}
            className="absolute inset-0 bg-v2-bg-overlay"
          />
          <div className="relative flex w-full max-w-[var(--roam-v2-size-content-max-width)] flex-col gap-v2-x5 rounded-v2-r5 bg-v2-bg-layer-floating p-v2-x5">
            <div className="flex flex-col gap-v2-x2">
              <p id="delete-ask" className="text-v2-t7 font-v2-bold tracking-v2-card-title">
                {system.deleteAsk}
              </p>
              <p className="text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">{system.deleteWarn}</p>
            </div>
            <div className="flex gap-v2-x2">
              <button
                type="button"
                autoFocus
                onClick={closeAsk}
                className="flex h-v2-x12 flex-1 items-center justify-center rounded-v2-r3 bg-v2-bg-neutral-weak text-v2-t4 font-v2-bold active:bg-v2-bg-neutral-weak-pressed"
              >
                {label.cancel}
              </button>
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="flex h-v2-x12 flex-1 items-center justify-center rounded-v2-r3 bg-v2-bg-critical-solid text-v2-t4 font-v2-bold text-v2-fg-on-critical-solid active:bg-v2-bg-critical-solid-pressed"
              >
                {label.delete}
              </button>
            </div>
          </div>
        </div>
      )}
    </MePage>
  );
}
