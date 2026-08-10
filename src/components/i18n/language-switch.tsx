"use client";

import { useRouter } from "next/navigation";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/config";
import { setLocale, useLocale } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * 언어 전환 — 푸터에 조용히 놓는 한 줄.
 *
 * 예전엔 첫 진입에 화면 전체를 덮는 언어 선택 게이트가 떴다. 브라우저가 이미 선호
 * 언어를 보내주므로(`negotiate.ts`) 물어볼 필요가 없고, 그 모달이 홈페이지를 가려
 * Google OAuth 인증이 반려됐다. 이제 자동 판별이 기본이고, 바꾸고 싶은 사람만 여기서
 * 바꾼다. 고르면 쿠키를 쓰고 새로고침 — 서버가 그 언어로 다시 렌더한다.
 */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const router = useRouter();
  const current = useLocale();

  function pick(l: Locale) {
    if (l === current) return;
    setLocale(l);
    router.refresh();
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 text-xs text-muted-foreground",
        className,
      )}
    >
      {LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="text-border">
              ·
            </span>
          )}
          <button
            type="button"
            onClick={() => pick(l)}
            aria-current={l === current ? "true" : undefined}
            className={cn(
              "active:opacity-70",
              l === current
                ? "font-bold text-foreground"
                : "underline underline-offset-2",
            )}
          >
            {LOCALE_LABEL[l]}
          </button>
        </span>
      ))}
    </div>
  );
}
