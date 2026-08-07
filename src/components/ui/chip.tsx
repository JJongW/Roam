import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full font-semibold",
  {
    variants: {
      variant: {
        tint: "",
        outline: "border border-border bg-card text-foreground/90",
      },
      size: {
        sm: "min-h-8 px-2.5 text-xs",
        md: "min-h-9 px-3 text-sm",
        lg: "min-h-10 px-3.5 text-sm",
      },
    },
    defaultVariants: { variant: "tint", size: "sm" },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  /** hex 색(예: "#4f46e5"). tint variant에서만 쓰임 — 없으면 --primary 기본값. */
  color?: string;
  icon?: React.ReactNode;
}

export function Chip({
  variant = "tint",
  size = "sm",
  color,
  icon,
  className,
  style,
  children,
  ...props
}: ChipProps) {
  const isTint = variant === "tint";
  const tintStyle = isTint && color ? { backgroundColor: `${color}1a`, color, ...style } : style;
  return (
    <span
      className={cn(
        chipVariants({ variant, size }),
        isTint && !color && "bg-primary/10 text-primary",
        className,
      )}
      style={tintStyle}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
