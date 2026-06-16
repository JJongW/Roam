import { ArrowUp, CornerUpLeft, CornerUpRight, RotateCcw, MapPin } from "lucide-react";
import type { NavInstruction } from "@/lib/engine/navigation";

const ICON = {
  straight: ArrowUp,
  left: CornerUpLeft,
  right: CornerUpRight,
  back: RotateCcw,
  arrive: MapPin,
} as const;

export function NavInstructionBanner({ instruction, stepLabel }: { instruction: NavInstruction; stepLabel: string }) {
  const IconCmp = ICON[instruction.direction];
  const arrive = instruction.direction === "arrive";
  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div
        className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"
        style={!arrive && instruction.direction === "straight" ? { transform: `rotate(${0}deg)` } : undefined}
      >
        <IconCmp className="size-9" strokeWidth={2.4} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{stepLabel}</p>
        <p className="truncate text-xl font-extrabold leading-tight">{instruction.text}</p>
        {!arrive && <p className="text-sm tabular text-muted-foreground">약 {instruction.meters}m 남음</p>}
      </div>
    </div>
  );
}
