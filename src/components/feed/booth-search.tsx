"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Loader2, ChevronRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { CategoryChip } from "@/components/booth/category-chip";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Booth, Category, Paginated } from "@/lib/types";

/**
 * 피드 상단 부스 검색 — 전체 전시 부스를 이름·상호로 찾는다(피드는 추천 몇 개뿐이라
 * "그 부스 어디 있지"를 검색으로 해결). 입력 디바운스 후 /booths?q= 조회, 결과는
 * 피드와 같은 카드 형태로. 비었으면 아무것도 안 그려 피드가 그대로 보인다.
 */
export function BoothSearch({
  slug,
  categoryById,
}: {
  slug: string;
  categoryById: Record<string, Category>;
}) {
  const t = useT();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Booth[] | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const timer = setTimeout(() => {
      api
        .get<Paginated<Booth>>(
          `/api/exhibitions/${slug}/booths?q=${encodeURIComponent(query)}&limit=30`,
        )
        .then((page) => {
          if (id !== seq.current) return; // 최신 입력만 반영
          setResults(page.data);
        })
        .catch(() => id === seq.current && setResults([]))
        .finally(() => id === seq.current && setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [q, slug]);

  const active = q.trim().length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-[var(--shadow-card)] focus-within:border-primary/50">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("feed.searchPlaceholder")}
          aria-label={t("feed.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading && (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
        )}
        {active && !loading && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label={t("common.close")}
            className="shrink-0 text-muted-foreground active:opacity-70"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {active && results && (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          {results.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-muted-foreground">
              {t("feed.searchEmpty", { q: q.trim() })}
            </p>
          ) : (
            results.map((b, i) => {
              const cat = categoryById[b.categoryId];
              const thumb = b.images?.[0] ?? b.logoUrl;
              return (
                <Link
                  key={b.id}
                  href={`/booths/${b.id}`}
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 active:bg-accent/40",
                    i > 0 && "border-t border-border/60",
                  )}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                    style={{
                      backgroundColor: cat
                        ? `${cat.color}1a`
                        : "var(--secondary)",
                    }}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN
                      <img
                        src={thumb}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span
                        className="text-sm font-bold"
                        style={{ color: cat?.color }}
                      >
                        {b.name.slice(0, 1)}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{b.name}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {b.code && (
                        <span className="text-xs font-semibold tabular text-muted-foreground">
                          {b.code}
                        </span>
                      )}
                      {cat && <CategoryChip category={cat} />}
                    </div>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
