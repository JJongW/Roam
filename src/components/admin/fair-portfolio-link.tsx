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
 * 그 행사의 분석 화면으로 간다.
 */
export function FairPortfolioLink({
  exhibitionId,
  className,
  children,
}: {
  exhibitionId: string;
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
      router.push(FAIR_LANDING_PATH);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.error.message : "행사를 바꾸지 못했어요");
      setPending(false);
    }
  }

  return (
    <a
      href={FAIR_LANDING_PATH}
      onClick={onClick}
      aria-busy={pending || undefined}
      className={cn(className, pending && "opacity-60")}
    >
      {children}
    </a>
  );
}
