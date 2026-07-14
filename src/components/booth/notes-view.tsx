"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronRight,
  Clock3,
  Star,
  X,
  MapPin,
  NotebookPen,
} from "lucide-react";
import { AppBar } from "@/components/common/app-bar";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVisitStore } from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useT } from "@/lib/i18n/provider";
import type { Booth, Category } from "@/lib/types";

const STATUS = {
  visited: { i18nKey: "seen", Icon: Check },
  interested: { i18nKey: "interested", Icon: Star },
  later: { i18nKey: "later", Icon: Clock3 },
  skipped: { i18nKey: "skip", Icon: X },
} as const;

/**
 * 내 메모장 — every booth the visitor left a note or photo on, gathered in one
 * place. Reads the same local visit store the booth detail writes to, so it
 * works without sign-in. Read-only here; editing stays on the booth detail.
 */
export function NotesView({
  slug,
  booths,
  categories,
  onClose,
  onLocate,
}: {
  slug: string;
  booths: Booth[];
  categories: Category[];
  /** When provided, render as an in-place overlay (no route change) — back
   *  closes the overlay instead of navigating. Keeps the map mounted underneath
   *  so opening/closing the 메모장 is instant. */
  onClose?: () => void;
  /** Overlay mode: focus a booth on the live map (closes the overlay + centers)
   *  instead of navigating to /map?booth=. */
  onLocate?: (boothId: string) => void;
}) {
  const router = useRouter();
  const t = useT();
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const catById = new Map(categories.map((c) => [c.id, c]));

  // Booths with a non-empty memo or at least one photo, ordered by stand number.
  const noted = hydrated
    ? booths
        .filter((b) => {
          const r = records[b.id];
          return Boolean(r && (r.memo?.trim() || r.photos?.length));
        })
        .sort((a, b) =>
          (a.code ?? a.name).localeCompare(b.code ?? b.name, "ko"),
        )
    : [];

  return (
    <main
      className={
        onClose
          ? "fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background pb-safe"
          : "flex flex-1 flex-col pb-safe"
      }
    >
      <AppBar
        title={t("notes.title")}
        onBack={onClose ?? (() => router.push(`/exhibitions/${slug}/map`))}
      />

      {!hydrated ? (
        <div className="space-y-3 p-4">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
        </div>
      ) : noted.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 text-center">
          <EmptyState
            title={t("notes.empty")}
            description={t("notes.emptyDesc")}
          />
          <Button asChild>
            <Link href={`/exhibitions/${slug}/map`}>
              <MapPin className="size-4" /> {t("notes.browseMap")}
            </Link>
          </Button>
        </div>
      ) : (
        <>
          <p className="px-4 pb-1 pt-3 text-sm text-muted-foreground">
            {t("notes.notedCount", { n: noted.length })}
          </p>
          <ul className="space-y-3 p-4 pt-2">
            {noted.map((b) => {
              const r = records[b.id];
              const cat = catById.get(b.categoryId);
              const status = r?.status ? STATUS[r.status] : null;
              return (
                <li
                  key={b.id}
                  className="space-y-3 rounded-2xl border border-border bg-card p-4"
                >
                  <div className="flex items-start gap-2">
                    <span
                      aria-hidden
                      className="mt-1.5 size-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          cat?.color ?? "var(--muted-foreground)",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold leading-snug">{b.name}</h2>
                      <p className="text-xs text-muted-foreground">
                        {b.code ? `${b.code} · ` : ""}
                        {cat?.name ?? ""}
                      </p>
                    </div>
                    {status && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                        <status.Icon className="size-3.5" />{" "}
                        {t("notes." + status.i18nKey)}
                      </span>
                    )}
                  </div>

                  {r?.memo?.trim() && (
                    <p className="whitespace-pre-wrap break-words rounded-xl bg-secondary/60 px-3 py-2.5 text-sm leading-relaxed">
                      {r.memo}
                    </p>
                  )}

                  {r?.photos && r.photos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {r.photos.map((src) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={src}
                          src={src}
                          alt={t("notes.photoAlt", { name: b.name })}
                          loading="lazy"
                          className="aspect-square w-full rounded-lg object-cover"
                        />
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-0.5">
                    {onLocate ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                        onClick={() => onLocate(b.id)}
                      >
                        <MapPin className="size-4" /> {t("notes.viewOnMap")}
                      </Button>
                    ) : (
                      <Button
                        asChild
                        variant="secondary"
                        size="sm"
                        className="flex-1"
                      >
                        <Link href={`/exhibitions/${slug}/map?booth=${b.id}`}>
                          <MapPin className="size-4" /> {t("notes.viewOnMap")}
                        </Link>
                      </Button>
                    )}
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                    >
                      <Link href={`/booths/${b.id}`}>
                        {t("common.detail")} <ChevronRight className="size-4" />
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {hydrated && noted.length > 0 && (
        <p className="px-4 pb-4 text-center text-xs text-muted-foreground">
          <NotebookPen className="mb-0.5 mr-1 inline size-3.5" />
          {t("notes.syncNote")}
        </p>
      )}
    </main>
  );
}
