import { Bus, CarFront, Ticket, Info, type LucideIcon } from "lucide-react";
import type { ExhibitionTips } from "@/lib/types";

const ROWS: { key: keyof ExhibitionTips; label: string; icon: LucideIcon }[] = [
  { key: "transportation", label: "교통", icon: Bus },
  { key: "parking", label: "주차", icon: CarFront },
  { key: "ticket", label: "입장권", icon: Ticket },
  { key: "guide", label: "관람 안내", icon: Info },
];

export function Tips({ tips }: { tips: ExhibitionTips }) {
  const rows = ROWS.filter((r) => tips[r.key]);
  if (rows.length === 0) return null;
  return (
    <ul className="space-y-2">
      {rows.map(({ key, label, icon: IconCmp }) => (
        <li key={key} className="flex gap-3 rounded-xl border border-border bg-card p-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <IconCmp className="size-4.5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold">{label}</p>
            <p className="text-sm leading-relaxed text-muted-foreground">{tips[key]}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
