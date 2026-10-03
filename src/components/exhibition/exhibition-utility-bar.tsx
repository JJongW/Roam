"use client";

import { useState } from "react";
import { ExhibitionUtilityRow } from "@/components/exhibition/exhibition-utility-row";
import { BoothSearch } from "@/components/feed/booth-search";
import type { Category } from "@/lib/types";

/**
 * 유틸 행 + 접힌 부스 검색. 검색은 피드의 보조 경로라 상시 입력창으로
 * 자리를 점유할 이유가 없다 — 탭하면 전체폭으로 펼친다.
 * 서버 컴포넌트인 page.tsx가 상태를 들 수 없어 여기서 묶는다.
 */
export function ExhibitionUtilityBar({
  slug,
  showNotes,
  categoryById,
}: {
  slug: string;
  showNotes: boolean;
  categoryById: Record<string, Category>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="space-y-[var(--spacing-component-default)]">
      <ExhibitionUtilityRow
        slug={slug}
        showNotes={showNotes}
        onSearch={() => setSearchOpen((v) => !v)}
      />
      {searchOpen && <BoothSearch slug={slug} categoryById={categoryById} />}
    </div>
  );
}
