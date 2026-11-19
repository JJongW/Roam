"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { selectAdminExhibition } from "./select-exhibition";

/** 홈 포트폴리오에서 박람회를 누르면 이 화면으로 간다. 박람회 하나를 보는 첫 화면이다. */
export const FAIR_LANDING_PATH = "/admin/analytics";

/**
 * 홈의 행사 포트폴리오 한 줄. 누르면 선택기와 같은 길(쿠키 저장)로 그 행사를 고르고
 * 그 행사의 화면으로 간다. 기본은 분석이고, 홈의 처리할 것 카드는 그 큐(`href`)로 보낸다.
 */
export function FairPortfolioLink({
  exhibitionId,
  href = FAIR_LANDING_PATH,
  className,
  children,
}: {
  exhibitionId: string;
  /** 고른 뒤 갈 박람회 화면. 박람회 하나를 보는 화면이어야 한다(fair-scope). */
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      await selectAdminExhibition(exhibitionId);
      // 분석 화면은 요청마다 쿠키를 읽는 동적 화면이라 push로 새 선택이 바로 반영된다.
      router.push(href);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.error.message : "행사를 바꾸지 못했어요");
      setPending(false);
    }
  }

  return (
    <a
      href={href}
      onClick={onClick}
      aria-busy={pending || undefined}
      className={cn(className, pending && "opacity-60")}
    >
      {children}
    </a>
  );
}
