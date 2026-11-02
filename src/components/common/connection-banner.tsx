"use client";

import { useCallback, useEffect, useState } from "react";
import { CloudOff, Loader2, UploadCloud, Wifi } from "lucide-react";
import { useOnline } from "@/lib/hooks/use-online";
import { useT } from "@/lib/i18n/provider";
import { useVisitStore } from "@/lib/stores/visit";
import { syncPendingReactions, useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/utils";

/** 다시 연결됐다는 말이 남아 있는 시간. */
const RESTORED_MS = 2400;

/**
 * 연결과 저장 상태를 말해주는 띠 하나. 앱 전체에 하나만 둔다(providers).
 *
 * 세 가지를 한 자리에서 말한다 — 끊김 / 복구 / **아직 못 올린 반응**. 셋 다
 * 같은 사건의 앞뒤라서 각자 다른 자리에 띄우면 사용자가 연결을 짚어 보지 못한다.
 *
 * z-40 — 바텀시트(z-50)보다 아래다. 시트가 열려 있을 땐 그 시트가 지금의 할 일이고,
 * 띠가 시트의 버튼을 덮으면 안 된다.
 *
 * 화면을 가로막지 않는다 — 열람은 이미 받아둔 데이터로 계속 되고, 안 되는 건
 * 저장·불러오기뿐이다. 그래서 전면 차단이 아니라 "지금 이 상태"를 알려주고,
 * 가장 걱정되는 것(쓴 게 날아갔나)에 먼저 답한다.
 *
 * 못 올린 반응은 **연결이 돌아오면 자동으로 한 번 다시 올린다**. 예전엔 이
 * 재시도가 로그인 시점에만 있어서, 이미 로그인한 사람이 끊긴 채 누른 반응은
 * 그 기기를 떠나지 못했다(캐시를 비우면 사라진다).
 */
export function ConnectionBanner() {
  const online = useOnline();
  const t = useT();
  const pending = useVisitStore((s) => s.hasPendingSync);
  const user = useAuthStore((s) => s.user);
  const [sending, setSending] = useState(false);
  // 끊김→복구 전환을 렌더 중에 잡는다 — effect 안에서 되돌리면 연쇄 렌더가 된다.
  const [wasOnline, setWasOnline] = useState(online);
  const [restored, setRestored] = useState(false);
  if (wasOnline !== online) {
    setWasOnline(online);
    // 연결되면 켜고, 끊기면 끈다 — 다시 끊긴 뒤 복구되면 처음부터 다시 센다.
    setRestored(online);
  }

  useEffect(() => {
    if (!restored) return;
    const id = setTimeout(() => setRestored(false), RESTORED_MS);
    return () => clearTimeout(id);
  }, [restored]);

  const send = useCallback(() => {
    setSending(true);
    // 실패하면 pending이 그대로 남아 띠도 남는다 — 조용히 포기하지 않는다.
    void syncPendingReactions().finally(() => setSending(false));
  }, []);

  // 연결 복구 + 로그인 상태 + 못 올린 게 있음 → 자동으로 한 번.
  // pending은 성공해야 꺼지므로 실패해도 이 effect가 다시 돌지 않는다(루프 없음).
  useEffect(() => {
    if (!online || !pending || !user) return;
    // 네트워크가 돌아왔다는 **외부 시스템의 전환**에 맞춰 올린다 — effect가 바로
    // 이걸 위한 자리다. send()가 로딩 표시를 켜느라 동기 setState를 한다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    send();
  }, [online, pending, user, send]);

  // 올릴 게 남았다는 말은 **로그인 사용자에게만** 뜻이 있다 — 비로그인은 애초에
  // 서버에 올릴 자리가 없고, 그 안내는 judgment-bar의 로그인 권유가 따로 한다.
  const showPending = online && Boolean(user) && pending;
  if (!online) return <Bar tone="offline" icon={<CloudOff className="size-4 shrink-0" aria-hidden />} text={t("offline.bar")} />;
  if (showPending)
    return (
      <Bar
        tone="pending"
        icon={
          sending ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <UploadCloud className="size-4 shrink-0" aria-hidden />
          )
        }
        text={t(sending ? "offline.pendingSaving" : "offline.pending")}
        action={
          sending ? undefined : (
            <button
              type="button"
              onClick={send}
              className="shrink-0 font-bold underline underline-offset-2"
            >
              {t("offline.pendingRetry")}
            </button>
          )
        }
      />
    );
  if (restored)
    return <Bar tone="restored" icon={<Wifi className="size-4 shrink-0" aria-hidden />} text={t("offline.restored")} />;
  return null;
}

function Bar({
  tone,
  icon,
  text,
  action,
}: {
  tone: "offline" | "restored" | "pending";
  icon: React.ReactNode;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      // polite — 입력 중이던 사람의 포커스를 빼앗지 않는다.
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 px-4 py-2.5 pb-safe text-center text-[13px] font-medium",
        tone === "offline"
          ? "bg-foreground text-background"
          : "bg-secondary text-foreground",
      )}
    >
      {icon}
      <span className="min-w-0">{text}</span>
      {action}
    </div>
  );
}
