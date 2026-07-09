"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { MapPinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";

/**
 * Context-aware 404 for the visitor flow. Catches notFound() from booth
 * detail (/booths/[id]) and shared routes (/r/[shareId]) so a stale/typo
 * link lands inside the mobile shell with a way back — not the bare global 404.
 */
export default function VisitorNotFound() {
  const router = useRouter();
  const t = useT();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-8 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-secondary">
        <MapPinOff className="size-7 text-primary" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold">{t("notFound.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("notFound.desc")}</p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-2">
        <Button onClick={() => router.back()}>{t("notFound.back")}</Button>
        <Button asChild variant="secondary">
          <Link href="/">{t("notFound.toList")}</Link>
        </Button>
      </div>
    </div>
  );
}
