import Image from "next/image";
import { cn } from "@/lib/utils";

/** 정적 로미 로고 아바타 — 상주 필·반응 토스트 등 작은 자리에서 재사용한다. */
export function RoamAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border",
        className,
      )}
    >
      <Image
        src="/logo.svg"
        alt="Roam"
        width={32}
        height={32}
        className="size-full object-cover"
        unoptimized
      />
    </span>
  );
}
