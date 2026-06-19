"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import {
  X,
  Heart,
  RotateCcw,
  Sparkles,
  Route as RouteIcon,
} from "lucide-react";
import { useCartStore } from "@/lib/stores/cart";
import { exhibitorBooths } from "@/lib/booth/normalize";
import { CategoryChip } from "@/components/booth/category-chip";
import { Button } from "@/components/ui/button";
import type { Booth, Category } from "@/lib/types";

const SWIPE_THRESHOLD = 100;
const DECK_SIZE = 40;

/**
 * Tinder-style booth discovery for low-involvement visitors ("골라드릴까요?").
 * Swipe right = 동선에 담기 (seed), left = 관심 없음. Cards show the cover image
 * when a booth has one, otherwise a typographic name/publisher card — so it works
 * today on text-only seed data and upgrades automatically once covers exist.
 */
export function SwipeDeck({
  slug,
  booths,
  categories,
  open,
  onClose,
}: {
  slug: string;
  booths: Booth[];
  categories: Category[];
  open: boolean;
  onClose: () => void;
}) {
  const addToCart = useCartStore((s) => s.add);
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories],
  );

  // Exhibitors only (no lounge/stage), most relevant first, capped — a 40-card
  // deck stays playful, not endless.
  const deck = useMemo(
    () =>
      exhibitorBooths(booths)
        .sort((a, b) => b.popularity - a.popularity)
        .slice(0, DECK_SIZE),
    [booths],
  );

  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState<string[]>([]);

  if (!open) return null;

  const done = index >= deck.length;

  function decide(dir: "like" | "skip") {
    const booth = deck[index];
    if (!booth) return;
    if (dir === "like") {
      addToCart(booth.id);
      setLiked((l) => (l.includes(booth.id) ? l : [...l, booth.id]));
    }
    setIndex((i) => i + 1);
  }

  function restart() {
    setIndex(0);
    setLiked([]);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="flex size-9 items-center justify-center rounded-full hover:bg-secondary"
        >
          <X className="size-5" />
        </button>
        <h1 className="text-base font-extrabold">휙휙 골라보기</h1>
        <span className="w-9 text-right text-sm font-semibold tabular text-muted-foreground">
          {Math.min(index + (done ? 0 : 1), deck.length)}/{deck.length}
        </span>
      </header>

      {done ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <Sparkles className="size-10 text-primary" />
          <div>
            <p className="text-lg font-extrabold">
              {liked.length > 0
                ? `${liked.length}곳을 담았어요`
                : "담은 곳이 없어요"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {liked.length > 0
                ? "이대로 동선을 만들어 볼까요?"
                : "다시 둘러보거나 질문으로 추천받아 보세요."}
            </p>
          </div>
          <div className="flex w-full max-w-xs flex-col gap-2">
            {liked.length > 0 && (
              <Button asChild size="lg">
                <Link href={`/exhibitions/${slug}/route`}>
                  <RouteIcon className="size-5" /> 동선 만들기
                </Link>
              </Button>
            )}
            <Button variant="secondary" onClick={restart}>
              <RotateCcw className="size-5" /> 다시 보기
            </Button>
            <Button variant="ghost" asChild>
              <Link href={`/exhibitions/${slug}/onboarding`}>
                질문으로 추천받기
              </Link>
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative flex-1 overflow-hidden p-5">
            {/* Render current + next card for a stacked-deck feel. */}
            {deck
              .slice(index, index + 2)
              .map((booth, i) => (
                <SwipeCard
                  key={booth.id}
                  booth={booth}
                  category={catById.get(booth.categoryId)}
                  isTop={i === 0}
                  onDecide={decide}
                />
              ))
              .reverse()}
          </div>

          <div className="flex items-center justify-center gap-6 border-t border-border p-4 pb-safe">
            <button
              type="button"
              aria-label="관심 없음"
              onClick={() => decide("skip")}
              className="flex size-16 items-center justify-center rounded-full border-2 border-border bg-card text-muted-foreground shadow-[var(--shadow-card)] active:scale-95"
            >
              <X className="size-7" />
            </button>
            <button
              type="button"
              aria-label="동선에 담기"
              onClick={() => decide("like")}
              className="flex size-16 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground shadow-[var(--shadow-pop)] active:scale-95"
            >
              <Heart className="size-7" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function SwipeCard({
  booth,
  category,
  isTop,
  onDecide,
}: {
  booth: Booth;
  category?: Category;
  isTop: boolean;
  onDecide: (dir: "like" | "skip") => void;
}) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);
  const likeOpacity = useTransform(x, [20, 120], [0, 1]);
  const skipOpacity = useTransform(x, [-120, -20], [1, 0]);

  const cover = booth.images[0] ?? booth.logoUrl;
  const accent = category?.color ?? "var(--primary)";

  function onDragEnd(_: unknown, info: PanInfo) {
    if (info.offset.x > SWIPE_THRESHOLD) onDecide("like");
    else if (info.offset.x < -SWIPE_THRESHOLD) onDecide("skip");
  }

  return (
    <motion.div
      className="absolute inset-5"
      style={isTop ? { x, rotate } : { scale: 0.96, y: 12 }}
      drag={isTop ? "x" : false}
      dragSnapToOrigin
      dragElastic={0.6}
      onDragEnd={isTop ? onDragEnd : undefined}
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-pop)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={booth.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div
            className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
            style={{
              background: `linear-gradient(160deg, ${accent}22, ${accent}05)`,
            }}
          >
            {category && <CategoryChip category={category} />}
            <p className="text-2xl font-extrabold leading-tight">
              {booth.name}
            </p>
            <p className="text-sm text-muted-foreground">{booth.company}</p>
          </div>
        )}

        {/* gradient + meta overlay (covers the cover-image case too) */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <p className="text-lg font-extrabold text-white drop-shadow">
            {booth.name}
            {booth.code && (
              <span className="ml-1.5 text-sm font-semibold text-white/80">
                {booth.code}
              </span>
            )}
          </p>
          <p className="truncate text-sm text-white/85">{booth.company}</p>
        </div>

        {isTop && (
          <>
            <motion.div
              style={{ opacity: likeOpacity }}
              className="absolute left-5 top-5 rounded-lg border-2 border-primary px-3 py-1 text-lg font-extrabold text-primary"
            >
              담기
            </motion.div>
            <motion.div
              style={{ opacity: skipOpacity }}
              className="absolute right-5 top-5 rounded-lg border-2 border-muted-foreground px-3 py-1 text-lg font-extrabold text-muted-foreground"
            >
              패스
            </motion.div>
          </>
        )}
      </div>
    </motion.div>
  );
}
