"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronDown, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { VISIT_PURPOSE_OPTIONS } from "@/lib/constants";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { api, ApiClientError } from "@/lib/api/client";
import { userPreferenceInputSchema } from "@/lib/schemas";
import { AGE_GROUPS, type AgeGroup, type Category, type RoutePlan } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/icon";

const AGE_LABELS: Record<AgeGroup, string> = {
  "10s": "10대",
  "20s": "20대",
  "30s": "30대",
  "40s": "40대",
  "50s+": "50대+",
};

/**
 * Onboarding: a single screen that asks only what matters — 관심 분야 · 나이 ·
 * 관람 목적. Tapping an interest expands keywords drawn from that category's
 * booths so the choice is concrete. (Replaces the old multi-step wizard + chat.)
 */
export function OnboardingWizard({
  slug,
  categories,
}: {
  slug: string;
  categories: Category[];
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Record<string, string[]> | null>(
    null,
  );
  const store = useOnboardingStore();
  const setRoute = useRouteStore((s) => s.setRoute);
  const setCartIds = useCartStore((s) => s.setIds);

  // Keywords per category — lazy; shown under an expanded interest cell.
  useEffect(() => {
    let cancelled = false;
    api
      .get<{ keywords: Record<string, string[]> }>(
        `/api/exhibitions/${slug}/keywords`,
      )
      .then((r) => {
        if (!cancelled) setKeywords(r.keywords ?? {});
      })
      .catch(() => {
        if (!cancelled) setKeywords({});
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const ready =
    store.interests.length > 0 && Boolean(store.age) && store.visitPurposes.length > 0;

  async function submit() {
    if (!ready || submitting) return;
    const parsed = userPreferenceInputSchema.safeParse({
      visitPurposes: store.visitPurposes,
      interests: store.interests,
      age: store.age,
    });
    if (!parsed.success) {
      toast.error("관심 분야·나이·관람 목적을 모두 선택해 주세요");
      return;
    }
    setSubmitting(true);
    try {
      const { route } = await api.post<{ route: RoutePlan }>("/api/route", {
        exhibitionSlug: slug,
        preference: parsed.data,
      });
      setRoute(route);
      setCartIds(route.boothIds);
      router.push(`/exhibitions/${slug}/route`);
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "동선 생성에 실패했어요";
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/80 px-2 pt-safe backdrop-blur-xl">
        <Button
          variant="ghost"
          size="icon"
          aria-label="이전"
          onClick={() => router.back()}
        >
          <ChevronLeft className="size-6" />
        </Button>
        <h1 className="text-lg font-extrabold">맞춤 동선 만들기</h1>
      </header>

      <div className="flex-1 space-y-8 overflow-y-auto px-5 py-6">
        {/* 1. 관심 분야 — tap to select; expands keywords from that category */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-extrabold">어떤 분야에 관심 있으세요?</h2>
            <p className="text-sm text-muted-foreground">
              분야를 누르면 어떤 부스가 있는지 키워드로 보여드려요 · 여러 개 선택
              가능
            </p>
          </div>
          <div className="space-y-2">
            {categories.map((c) => {
              const selected = store.interests.includes(c.slug);
              const open = expanded === c.slug;
              const kws = keywords?.[c.slug] ?? [];
              return (
                <div
                  key={c.id}
                  className={cn(
                    "overflow-hidden rounded-2xl border transition-colors",
                    selected
                      ? "border-primary bg-accent/40"
                      : "border-border bg-card",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => {
                      store.toggleInterest(c.slug);
                      setExpanded((e) => (e === c.slug ? null : c.slug));
                    }}
                    className="flex w-full items-center gap-3 p-3.5 text-left"
                  >
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      style={{
                        backgroundColor: `${c.color}22`,
                        color: c.color,
                      }}
                    >
                      <Icon name={c.icon} className="size-5" />
                    </span>
                    <span className="flex-1 font-bold">{c.name}</span>
                    {selected && (
                      <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                        선택됨
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        "size-5 shrink-0 text-muted-foreground transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </button>
                  {open && (
                    <div className="px-3.5 pb-3.5">
                      {keywords === null ? (
                        <div className="flex flex-wrap gap-1.5" aria-label="키워드 불러오는 중">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span
                              key={i}
                              className="h-6 w-16 animate-pulse rounded-full bg-secondary"
                            />
                          ))}
                        </div>
                      ) : kws.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {kws.map((k) => (
                            <span
                              key={k}
                              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground/80"
                            >
                              {k}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          이 분야의 키워드가 아직 없어요.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 2. 나이 */}
        <section className="space-y-3">
          <h2 className="text-xl font-extrabold">나이대가 어떻게 되세요?</h2>
          <div className="flex flex-wrap gap-2">
            {AGE_GROUPS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => store.setAge(a)}
                aria-pressed={store.age === a}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
                  store.age === a
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground",
                )}
              >
                {AGE_LABELS[a]}
              </button>
            ))}
          </div>
        </section>

        {/* 3. 관람 목적 */}
        <section className="space-y-3">
          <div>
            <h2 className="text-xl font-extrabold">관람 목적이 무엇인가요?</h2>
            <p className="text-sm text-muted-foreground">여러 개 선택 가능</p>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {VISIT_PURPOSE_OPTIONS.map((o) => {
              const on = store.visitPurposes.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => store.togglePurpose(o.value)}
                  aria-pressed={on}
                  className={cn(
                    "flex items-center gap-2.5 rounded-2xl border p-3.5 text-left transition-colors",
                    on
                      ? "border-primary bg-accent/40"
                      : "border-border bg-card",
                  )}
                >
                  <Icon
                    name={o.icon}
                    className={cn(
                      "size-5 shrink-0",
                      on ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{o.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {o.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl">
        <Button
          size="lg"
          className="w-full"
          disabled={!ready || submitting}
          onClick={submit}
        >
          {submitting ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Sparkles className="size-5" />
          )}
          {submitting ? "맞춤 동선 만드는 중" : "맞춤 동선 만들기"}
        </Button>
      </div>

      {/* Full-screen loading while the route is generated (the slowest step). */}
      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm font-semibold">맞춤 동선을 짜고 있어요…</p>
          <p className="text-xs text-muted-foreground">잠깐이면 돼요</p>
        </div>
      )}
    </div>
  );
}
