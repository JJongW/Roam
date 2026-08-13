"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, X, Loader2, ChevronRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { CategoryChip } from "@/components/booth/category-chip";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { useCompanionStore } from "@/lib/stores/companion";
import {
  buildCopresenceLine,
  type CopresencePositive,
} from "@/lib/companion/copresence";
import { useVisitStore } from "@/lib/stores/visit";
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
  const say = useCompanionStore((s) => s.saySpontaneous);
  const recordAction = useCompanionStore((s) => s.recordAction);
  const records = useVisitStore((s) => s.records);

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
          // 검색 첫 결과 = T6 트리거. 결과 목록 전체가 아니라 최상단 하나만
          // 대상으로 한다 — 검색 결과 개수만큼 발화하면 그게 더 잔소리다.
          recordAction();
          const first = page.data[0];
          if (first) {
            const positives: CopresencePositive[] = page.data
              .map((b) => {
                const r = records[b.id];
                if (r?.verdict === "good")
                  return { booth: b, kind: "good" as const };
                if (r?.interest === "must")
                  return { booth: b, kind: "must" as const };
                if (r?.interest === "curious")
                  return { booth: b, kind: "curious" as const };
                return null;
              })
              .filter((p): p is CopresencePositive => p !== null);
            const line = buildCopresenceLine(
              {
                trigger: "searchHit",
                booth: first,
                positives,
                categoryLabel: categoryById[first.categoryId]?.name,
              },
              t,
            );
            if (line) say("searchHit", line, Date.now());
          }
        })
        .catch(() => id === seq.current && setResults([]))
        .finally(() => id === seq.current && setLoading(false));
    }, 280);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, slug]);

  const active = q.trim().length > 0;

  // 검색해서 연 부스 = 능동적 강한 관심 → 브레인에 신호로 남긴다(로미가 인지·반영).
  function fireSearchOpen(boothId: string) {
    void api
      .post("/api/me/signal", { boothId, kind: "search_query" })
      .catch(() => {});
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-3.5 py-2.5 shadow-[var(--shadow-card)] focus-within:border-primary/50">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("feed.searchPlaceholder")}
          aria-label={t("feed.searchPlaceholder")}
          // 14px 이하 입력은 iOS가 포커스 시 페이지를 자동 확대한다 — 16px(text-base)
          // 미만을 쓰지 않는다(map-view.tsx의 메모 입력과 같은 이유).
          className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
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
                  onClick={() => fireSearchOpen(b.id)}
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
