"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function AppBar({
  title,
  showBack = true,
  right,
  transparent = false,
  className,
}: {
  title?: string;
  showBack?: boolean;
  right?: React.ReactNode;
  transparent?: boolean;
  className?: string;
}) {
  const router = useRouter();
  return (
    <header
      className={cn(
        "sticky top-0 z-40 flex h-14 items-center gap-1 px-2 pt-safe",
        transparent
          ? "bg-transparent"
          : "border-b border-border bg-background/80 backdrop-blur-xl",
        className,
      )}
    >
      {showBack ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="뒤로 가기"
          onClick={() => router.back()}
        >
          <ChevronLeft className="size-6" />
        </Button>
      ) : (
        <span className="w-2" />
      )}
      <h1 className="flex-1 truncate text-base font-bold">{title}</h1>
      <div className="flex items-center gap-0.5">{right}</div>
    </header>
  );
}
