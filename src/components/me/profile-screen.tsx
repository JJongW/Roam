"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserRound, UserRoundCheck } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { NICKNAME_MAX, nicknameProblem, providerName } from "@/lib/me/view";
import { BackButton } from "@/components/v2/back-button";
import type { User } from "@/lib/types";
import { InfoRow, MePage, PageTitle } from "./me-ui";

/** 15-02 프로필. 닉네임(누르면 15-03)과 로그인 방식. 로그인한 분만(proxy). */
export function ProfileScreen() {
  const user = useAuthStore((s) => s.user);
  const provider = providerName(user?.provider);
  useEffect(() => {
    track("screen_view", { screen: SCREEN.profile });
  }, []);
  return (
    <MePage back="/me/settings">
      <PageTitle title={label.profile} />
      <InfoRow
        icon={UserRound}
        title={label.nickname}
        value={user?.nickname}
        href="/me/profile/nickname"
      />
      {provider && <InfoRow icon={UserRoundCheck} title={label.loginMethod} value={provider} />}
      <p className="px-v2-x4 pt-v2-x4 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
        {system.profileNote}
      </p>
    </MePage>
  );
}

/**
 * 15-03 닉네임 바꾸기. 12자(Figma). 서버는 20자까지 받고 같은 닉네임은 409(11-16 결정 "같은 닉네임 막음").
 * 완료를 누르면 PATCH /api/me/nickname, 성공하면 계정 상태의 이름을 바꾸고 프로필로 돌아간다.
 */
export function NicknameScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [text, setText] = useState(user?.nickname ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const full = text.length >= NICKNAME_MAX;

  const save = async () => {
    if (busy) return;
    const value = text.trim();
    if (value === user?.nickname) {
      router.back();
      return;
    }
    if (nicknameProblem(value)) {
      setError(system.nicknameInvalid);
      track("nickname_change_result", { screen: SCREEN.nickname, props: { result: "invalid" } });
      return;
    }
    setBusy(true);
    try {
      const res = await api.patch<{ user: User }>("/api/me/nickname", { nickname: value });
      useAuthStore.setState({ user: res.user });
      track("nickname_change_result", { screen: SCREEN.nickname, props: { result: "ok" } });
      router.replace("/me/profile");
    } catch (e) {
      const taken = e instanceof ApiClientError && e.status === 409;
      setError(taken ? system.nicknameTaken : system.nicknameFailed);
      track("nickname_change_result", {
        screen: SCREEN.nickname,
        props: { result: taken ? "taken" : "failed" },
      });
      if (!taken) toast(system.nicknameFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral">
      <div className="mx-auto flex w-full max-w-[var(--roam-v2-size-content-max-width)] flex-col">
        <div className="flex items-center justify-between px-v2-x1-5 pt-safe">
          <BackButton fallbackHref="/me/profile" />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="flex h-v2-x11 items-center px-v2-x2-5 text-v2-t4 font-v2-bold text-v2-fg-brand disabled:text-v2-fg-neutral-subtle"
          >
            {label.done}
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          className="flex flex-col gap-v2-x2 px-v2-x4"
        >
          <PageTitleInline />
          <input
            type="text"
            autoFocus
            enterKeyHint="done"
            value={text}
            maxLength={NICKNAME_MAX}
            aria-label={label.nickname}
            aria-invalid={!!error}
            onChange={(e) => {
              setText(e.target.value.slice(0, NICKNAME_MAX));
              setError(null);
            }}
            className={
              "h-v2-x12 w-full rounded-v2-field border bg-v2-bg-layer-floating px-v2-x4 text-v2-t5 font-v2-medium caret-v2-fg-brand outline-none " +
              (error ? "border-v2-stroke-critical-solid" : "border-v2-stroke-neutral-contrast")
            }
          />
          <div className="flex items-start gap-v2-x2 text-v2-t3 font-v2-medium">
            <p
              role={error ? "alert" : undefined}
              className={`min-w-0 flex-1 ${error ? "text-v2-fg-critical" : "text-v2-fg-neutral-muted"}`}
            >
              {error ?? (full ? system.nicknameFull : system.nicknameHint)}
            </p>
            <span className="shrink-0 tabular-nums text-v2-fg-neutral-muted">
              {text.length}/{NICKNAME_MAX}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

function PageTitleInline() {
  return <h1 className="pb-v2-x1 pt-v2-x2 text-v2-t7 font-v2-bold tracking-v2-card-title">{label.nickname}</h1>;
}
