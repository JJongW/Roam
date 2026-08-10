"use client";

import { LEGAL_LINKS, isExternalLegalLink } from "@/lib/legal";
import { useT } from "@/lib/i18n/provider";

/**
 * 개인정보처리방침 · 이용약관 인라인 링크. 로그인 동의 지점·계정 패널·홈 푸터에서
 * 공통으로 쓰는 조용한 푸터.
 *
 * 방침은 자체 페이지(`/privacy`)라 같은 탭, 약관은 외부(Notion)라 새 탭으로 연다.
 * Google OAuth 인증은 **홈페이지에서 개인정보처리방침에 닿을 것**을 요구하므로,
 * 로그인 없이 열리는 화면(홈·로그인·언어 게이트)에는 이 줄이 반드시 있어야 한다.
 */
export function LegalLinks({ className = "" }: { className?: string }) {
  const t = useT();
  const link = (href: string, label: string) => {
    const external = isExternalLegalLink(href);
    return (
      <a
        href={href}
        {...(external
          ? { target: "_blank", rel: "noopener noreferrer" }
          : null)}
        className="underline underline-offset-2 active:opacity-70"
      >
        {label}
      </a>
    );
  };
  return (
    <p
      className={`flex items-center justify-center gap-2 text-xs text-muted-foreground ${className}`}
    >
      {link(LEGAL_LINKS.privacy, t("legal.privacy"))}
      <span aria-hidden className="text-border">
        ·
      </span>
      {link(LEGAL_LINKS.terms, t("legal.terms"))}
    </p>
  );
}
