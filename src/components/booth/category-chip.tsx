import { Icon } from "@/components/common/icon";
import { Chip } from "@/components/ui/chip";
import type { Category } from "@/lib/types";

export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  return (
    <Chip color={category.color} icon={<Icon name={category.icon} className="size-3.5" />} className={className}>
      {category.name}
    </Chip>
  );
}
