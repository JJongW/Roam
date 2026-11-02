"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  CloudOff,
  Lock,
  RotateCw,
  SearchX,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useCallback } from "react";
import { ApiClientError } from "@/lib/api/client";
import {
  ERROR_SHAPE,
  errorActionKey,
  errorCopyKey,
  type ErrorKind,
} from "@/lib/api/error-kind";
import { useT } from "@/lib/i18n/provider";
import { promptLogin } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** 던져진 값에서 실패 종류를 읽는다. 모르는 건 우리 쪽 문제로 본다. */
export function errorKindOf(e: unknown): ErrorKind {
  return e instanceof ApiClientError ? e.kind : "INTERNAL";
}

const ICON: Record<ErrorKind, LucideIcon> = {
  OFFLINE: CloudOff,
  VALIDATION: TriangleAlert,
  UNAUTHORIZED: Lock,
  FORBIDDEN: Lock,
  NOT_FOUND: SearchX,
  CONFLICT: RotateCw,
  UNPROCESSABLE: TriangleAlert,
  INTERNAL: TriangleAlert,
};

/**
 * 실패 하나를 화면 한 장으로.
 *
 * 종류를 안 보고 "다시 해보기"만 주던 자리를 대체한다 — 행동은 ERROR_SHAPE가
 * 정하고, 여기선 그 행동을 실제로 수행할 뿐이다.
 */
export function ApiErrorState({
  error,
  kind: kindProp,
  onRetry,
  className,
}: {
  error: unknown;
  /**
   * 종류를 바깥에서 아는 경우(예: 브라우저가 오프라인이라고 말해준 경우).
   * 던져진 값이 서버에서 온 불투명한 Error면 종류를 알 수 없는데, 그때도
   * "네트워크가 없다"는 건 알 수 있다 — 그 경우 이쪽이 이긴다.
   */
  kind?: ErrorKind;
  /** `retry`인 종류에서만 쓰인다. 없으면 버튼 대신 아무것도 안 나온다. */
  onRetry?: () => void;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const kind = kindProp ?? errorKindOf(error);
  const { action, ourFault } = ERROR_SHAPE[kind];
  const Icon = ICON[kind];

  // `fix`는 버튼을 주지 않는다 — 고칠 곳은 이 화면의 입력란이다.
  const run =
    action === "retry"
      ? onRetry
      : action === "login"
        ? () => router.push(`/login?next=${encodeURIComponent(pathname)}`)
        : action === "reload"
          ? () => router.refresh()
          : action === "leave"
            ? () => router.back()
            : undefined;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border px-6 py-12 text-center",
        ourFault
          ? "border-destructive/30 bg-destructive/5"
          : "border-border bg-card",
        className,
      )}
      role="alert"
    >
      <div
        className={cn(
          "flex size-12 items-center justify-center rounded-full",
          ourFault ? "bg-destructive/10" : "bg-secondary",
        )}
      >
        <Icon
          className={cn(
            "size-6",
            ourFault ? "text-destructive" : "text-muted-foreground",
          )}
          aria-hidden
        />
      </div>
      <div className="space-y-1">
        <p className="font-semibold">{t(errorCopyKey(kind, "title"))}</p>
        <p className="max-w-[18rem] text-sm text-muted-foreground">
          {t(errorCopyKey(kind, "desc"))}
        </p>
      </div>
      {run && (
        <Button variant="outline" size="sm" onClick={run}>
          {action === "retry" && <RotateCw className="size-4" />}
          {t(errorActionKey(action))}
        </Button>
      )}
    </div>
  );
}

/**
 * 저장·전송이 실패했을 때의 토스트. 화면을 통째로 바꿀 수 없는 자리(시트 안의
 * 저장 버튼 등)에서 쓴다.
 *
 * 서버 메시지를 그대로 띄우던 자리를 대체한다 — 그 메시지는 개발자용이라
 * "입력값을 확인해 주세요"처럼 무엇을 확인할지 안 알려주고, 종류도 안 구분됐다.
 * 빨강은 우리 쪽이 깨진 경우에만 쓴다.
 */
export function useApiErrorToast() {
  const t = useT();
  return useCallback(
    (e: unknown, fallbackTitle?: string) => {
      const kind = errorKindOf(e);
      const title = t(errorCopyKey(kind, "title"));
      const description = t(errorCopyKey(kind, "desc"));
      // 사전에 없는 키는 t()가 키 문자열을 돌려준다 — 그걸 화면에 띄우지 않는다.
      const safeTitle = title.startsWith("apiError.")
        ? (fallbackTitle ?? title)
        : title;
      const opts = description.startsWith("apiError.")
        ? undefined
        : { description };
      // 세션이 풀린 건 "실패"가 아니라 로그인하면 끝나는 일이다 — 토스트만 띄우면
      // 사용자는 다시 저장을 눌러보고 또 같은 토스트를 본다. 바로 로그인 길을 준다.
      if (kind === "UNAUTHORIZED") {
        promptLogin(safeTitle, opts?.description);
        return;
      }
      if (ERROR_SHAPE[kind].ourFault) toast.error(safeTitle, opts);
      else toast(safeTitle, opts);
    },
    [t],
  );
}
