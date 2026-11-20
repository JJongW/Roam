"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { api } from "@/lib/api/client";
import { label } from "@/lib/copy/v1";

/**
 * UI 18-01A 홈 머리 종. 로그인한 분에게만 보인다(브랜드 알림은 로그인한 분만, 11-17).
 * 안 읽은 알림이 있으면 점 하나. 숫자는 세지 않는다. 못 불러오면 점 없이 종만 둔다.
 */
export function InboxBell() {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .get<{ unread: number }>("/api/me/notifications")
      .then((r) => alive && setUnread(r.unread > 0))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <Link
      href="/inbox"
      aria-label={unread ? `${label.inbox}, ${label.inboxHasNew}` : label.inbox}
      className="relative flex size-v2-x11 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
    >
      <Bell aria-hidden className="size-[var(--roam-v2-icon-size-lg)]" />
      {unread && (
        <span
          aria-hidden
          className="absolute right-v2-x2-5 top-v2-x2-5 size-v2-x2 rounded-v2-full bg-v2-fg-brand"
        />
      )}
    </Link>
  );
}
