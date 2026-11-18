import Image from "next/image";
import { clsx } from "clsx";
import { V2_PX } from "@/styles/v2/lengths.generated";

/**
 * UI/로미 아바타(Figma 2991:631) — 흰 원 + Ink 로미(11-16 "브랜드색 원 + White 톤 금지").
 * 28은 줄과 알약, 36은 카드 윗선, 48은 시트 머리. 지도 부스 위에는 올리지 않는다.
 * 그림은 Figma Romi Default Ink 그대로(public/romi/romi-default-ink.svg).
 */
const SIZE = {
  sm: {
    box: "size-[var(--roam-v2-size-romi-avatar-sm)]",
    ink: V2_PX["size-romi-ink-sm"],
  },
  md: {
    box: "size-[var(--roam-v2-size-romi-avatar-md)]",
    ink: V2_PX["size-romi-ink-md"],
  },
  lg: {
    box: "size-[var(--roam-v2-size-romi-avatar-lg)]",
    ink: V2_PX["size-romi-ink-lg"],
  },
} as const;

export function RomiAvatar({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const s = SIZE[size];
  return (
    <span
      aria-hidden
      className={clsx(
        "flex shrink-0 items-center justify-center rounded-v2-full border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating shadow-v2-s1",
        s.box,
        className,
      )}
    >
      <Image
        src="/romi/romi-default-ink.svg"
        alt=""
        width={s.ink}
        height={s.ink}
        unoptimized
      />
    </span>
  );
}
