import { Icon } from "@/components/common/icon";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        className,
      )}
      style={{ backgroundColor: `${category.color}1a`, color: category.color }}
    >
      <Icon name={category.icon} className="size-3.5" />
      {category.name}
    </span>
  );
}
