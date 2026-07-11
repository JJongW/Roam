"use client";

import { LEGAL_LINKS } from "@/lib/legal";
import { useT } from "@/lib/i18n/provider";

/**
 * 개인정보처리방침 · 이용약관 인라인 링크. 외부(Notion) 새 탭. 로그인 동의 지점과
 * 계정 패널 등에서 공통으로 쓰는 조용한 푸터.
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  const t = useT();
  return (
    <p
      className={`flex items-center justify-center gap-2 text-xs text-muted-foreground ${className}`}
    >
      <a
        href={LEGAL_LINKS.privacy}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 active:opacity-70"
      >
        {t("legal.privacy")}
      </a>
      <span aria-hidden className="text-border">
        ·
      </span>
      <a
        href={LEGAL_LINKS.terms}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 active:opacity-70"
      >
        {t("legal.terms")}
      </a>
    </p>
  );
}
