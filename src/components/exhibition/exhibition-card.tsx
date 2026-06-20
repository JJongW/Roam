import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";
import { format } from "date-fns";
import type { Exhibition } from "@/lib/types";

export function ExhibitionCard({ exhibition }: { exhibition: Exhibition }) {
  const range = `${format(new Date(exhibition.startDate), "M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;
  return (
    <Link
      href={`/exhibitions/${exhibition.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]"
    >
      <div
        className="relative flex h-36 items-end bg-gradient-to-br from-primary/85 to-[#4338ca] p-4"
        style={
          exhibition.coverImageUrl
            ? { backgroundImage: `url(${exhibition.coverImageUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <span className="absolute right-3 top-3 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          {range}
        </span>
        <h3 className="text-xl font-bold leading-tight text-white drop-shadow-sm">{exhibition.name}</h3>
      </div>
      <div className="space-y-1.5 p-4">
        <p className="line-clamp-2 text-sm text-muted-foreground">{exhibition.description}</p>
        <div className="flex items-center gap-1 pt-1 text-sm font-medium text-foreground">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{exhibition.venue}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden />
          {range}
        </div>
      </div>
    </Link>
  );
}
