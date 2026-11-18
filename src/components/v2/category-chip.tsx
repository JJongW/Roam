import type { Category } from "@/lib/types";

/**
 * UI/분류 칩(Figma 2991:641) — 누르는 칩이 아니라 정보다. 점 색은 분류 데이터의 색이다
 * (디자인 값이 아니라 박람회 데이터, iOS CategoryChip과 같다).
 */
export function CategoryChip({ category }: { category: Pick<Category, "name" | "color"> }) {
  return (
    <span className="flex max-w-full items-center gap-v2-x1-5 rounded-v2-full bg-v2-bg-neutral-weak py-v2-x1 pl-v2-x2 pr-v2-x2-5 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
      <span
        aria-hidden
        className="size-v2-x2 shrink-0 rounded-v2-full"
        style={{ backgroundColor: category.color }}
      />
      <span className="truncate">{category.name}</span>
    </span>
  );
}
