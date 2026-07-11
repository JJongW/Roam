"use client";

import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

/**
 * 데이터 로드 실패 폴백 — error.tsx(에러 바운더리)가 렌더. 현장에서 막힘을
 * 이해 가능한 상태로 바꾼다: 무슨 일인지 + 다시 시도 액션. reset로 세그먼트 재시도.
 */
export function ErrorState({ reset }: { reset: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-16 text-center">
      <p className="text-base font-bold">{t("errorState.title")}</p>
      <p className="max-w-[18rem] text-sm text-muted-foreground">
        {t("errorState.desc")}
      </p>
      <Button onClick={reset} className="mt-1">
        <RotateCw className="size-4" />
        {t("errorState.retry")}
      </Button>
    </div>
  );
}
