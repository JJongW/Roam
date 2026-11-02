"use client";

import Link from "next/link";
import { Map as MapIcon, NotebookPen, Search } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 전시 화면 유틸리티 행 — 지도·메모장·부스 찾기.
 *
 * 예전엔 셋이 각각 가치 온보딩과 **똑같은** 카드(border·shadow·radius + 44px
 * 아이콘 타일 + 제목 + 설명 + 셰브론)였다. 테두리·면·그림자는 "독립된 객체이고
 * 이만큼 중요하다"는 신호라, 넷에 똑같이 주면 위계가 사라져 사용자가 넷을
 * 동등한 선택지로 읽는다. 셋은 *이동*이지 *행동*이 아니므로 껍데기만 벗긴다.
 *
 * ⚠️ 시각적 크기만 줄이고 **터치 영역 44px은 유지한다**(min-h-11, Apple HIG 44pt).
 * WCAG 2.5.8의 하한은 24px이지만 그건 통과/실패 판정선이고 편안함의 기준이 아니다.
 */
export function ExhibitionUtilityRow({
  slug,
  showNotes,
  onSearch,
}: {
  slug: string;
  /** 메모장은 계정에 묶인 저장이라 비로그인엔 숨긴다. */
  showNotes: boolean;
  onSearch: () => void;
}) {
  const t = useT();
  const cell =
    "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary text-sm font-semibold text-foreground active:opacity-70";

  return (
    <nav
      className="flex gap-[var(--spacing-between-chips)]"
      aria-label={t("exhibitionUtil.label")}
    >
      <Link href={`/exhibitions/${slug}/map`} className={cell}>
        <MapIcon className="size-[18px]" aria-hidden />
        {t("exhibitionUtil.map")}
      </Link>
      {showNotes && (
        <Link href={`/exhibitions/${slug}/notes`} className={cell}>
          <NotebookPen className="size-[18px]" aria-hidden />
          {t("exhibitionUtil.notes")}
        </Link>
      )}
      <button type="button" onClick={onSearch} className={cell}>
        <Search className="size-[18px]" aria-hidden />
        {t("exhibitionUtil.search")}
      </button>
    </nav>
  );
}
