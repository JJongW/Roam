"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronDown, Loader2, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";
import { VISIT_PURPOSE_OPTIONS } from "@/lib/constants";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { api, ApiClientError } from "@/lib/api/client";
import { userPreferenceInputSchema } from "@/lib/schemas";
import {
  AGE_GROUPS,
  type AgeGroup,
  type Category,
  type RoutePlan,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Icon } from "@/components/common/icon";

const AGE_LABELS: Record<AgeGroup, string> = {
  "10s": "10대",
  "20s": "20대",
  "30s": "30대",
  "40s": "40대",
  "50s+": "50대+",
};

const STEPS = ["interests", "age", "purpose"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, { title: string; sub: string }> = {
  interests: {
    title: "어떤 분야에 관심 있으세요?",
    sub: "분야를 누르고 끌리는 키워드를 골라주세요",
  },
  age: { title: "나이대가 어떻게 되세요?", sub: "한 가지만 골라주세요" },
  purpose: { title: "관람 목적이 무엇인가요?", sub: "여러 개 선택할 수 있어요" },
};

function haptic() {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8);
}

/**
 * Onboarding — three quick steps: 관심 분야 · 나이 · 관람 목적. The interest step
 * reveals keywords from each category's booths; picking keywords is how the
 * visitor's context is captured (a category counts as an interest once any of
 * its keywords is chosen). (Replaces the old 5-step wizard + chat.)
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
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [keywords, setKeywords] = useState<Record<string, string[]> | null>(
    null,
  );
  const store = useOnboardingStore();

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

  const key = STEPS[step];
  const meta = TITLES[key];
  const progress = ((step + 1) / STEPS.length) * 100;

  const canNext = useMemo(() => {
    if (key === "interests") return store.interests.length > 0;
    if (key === "age") return Boolean(store.age);
    return store.visitPurposes.length > 0;
  }, [key, store.interests.length, store.age, store.visitPurposes.length]);

  function go(delta: number) {
    setDir(delta);
    setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + delta)));
  }

  // Toggle a keyword; a category becomes an interest once it has ≥1 keyword.
  function toggleKeyword(slug: string, kw: string) {
    haptic();
    store.toggleKeyword(kw);
    const st = useOnboardingStore.getState();
    const catKws = keywords?.[slug] ?? [];
    const stillSelected = catKws.some((k) => st.keywords.includes(k));
    const interests = stillSelected
      ? Array.from(new Set([...st.interests, slug]))
      : st.interests.filter((i) => i !== slug);
    st.setInterests(interests);
  }

  async function submit() {
    if (submitting) return;
    const parsed = userPreferenceInputSchema.safeParse({
      visitPurposes: store.visitPurposes,
      interests: store.interests,
      age: store.age,
      keywords: store.keywords,
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
      useRouteStore.getState().setRoute(route);
      useCartStore.getState().setIds(route.boothIds);
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
          onClick={() => (step === 0 ? router.back() : go(-1))}
        >
          <ChevronLeft className="size-6" />
        </Button>
        <Progress value={progress} className="flex-1" />
        <span className="w-12 text-right text-sm font-semibold tabular text-muted-foreground">
          {step + 1}/{STEPS.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pt-6">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold leading-snug">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.sub}</p>
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={key}
            custom={dir}
            initial={{ opacity: 0, x: dir * 36 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -36 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="mt-6"
          >
            {key === "interests" && (
              <div className="space-y-2">
                {categories.map((c) => {
                  const open = expanded === c.slug;
                  const kws = keywords?.[c.slug] ?? [];
                  const picked = kws.filter((k) =>
                    store.keywords.includes(k),
                  ).length;
                  const active = store.interests.includes(c.slug);
                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "overflow-hidden rounded-2xl border transition-colors",
                        active
                          ? "border-primary bg-accent/40"
                          : "border-border bg-card",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          haptic();
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
                        {picked > 0 && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                            {picked}
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
                            <div
                              className="flex flex-wrap gap-1.5"
                              aria-label="키워드 불러오는 중"
                            >
                              {Array.from({ length: 5 }).map((_, i) => (
                                <span
                                  key={i}
                                  className="h-7 w-16 animate-pulse rounded-full bg-secondary"
                                />
                              ))}
                            </div>
                          ) : kws.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {kws.map((kw) => {
                                const on = store.keywords.includes(kw);
                                return (
                                  <button
                                    key={kw}
                                    type="button"
                                    onClick={() => toggleKeyword(c.slug, kw)}
                                    aria-pressed={on}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                                      on
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-border bg-background text-foreground/80",
                                    )}
                                  >
                                    {on && <Check className="size-3.5" />}
                                    {kw}
                                  </button>
                                );
                              })}
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
            )}

            {key === "age" && (
              <div className="flex flex-wrap gap-2">
                {AGE_GROUPS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => {
                      haptic();
                      store.setAge(a);
                    }}
                    aria-pressed={store.age === a}
                    className={cn(
                      "rounded-2xl border px-5 py-3 text-base font-bold transition-colors",
                      store.age === a
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground",
                    )}
                  >
                    {AGE_LABELS[a]}
                  </button>
                ))}
              </div>
            )}

            {key === "purpose" && (
              <div className="grid grid-cols-2 gap-2.5">
                {VISIT_PURPOSE_OPTIONS.map((o) => {
                  const on = store.visitPurposes.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        haptic();
                        store.togglePurpose(o.value);
                      }}
                      aria-pressed={on}
                      className={cn(
                        "flex items-start gap-2.5 rounded-2xl border p-3.5 text-left transition-colors",
                        on ? "border-primary bg-accent/40" : "border-border bg-card",
                      )}
                    >
                      <Icon
                        name={o.icon}
                        className={cn(
                          "mt-0.5 size-5 shrink-0",
                          on ? "text-primary" : "text-muted-foreground",
                        )}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">
                          {o.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {o.description}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl">
        {step < STEPS.length - 1 ? (
          <Button
            size="lg"
            className="w-full"
            disabled={!canNext}
            onClick={() => {
              haptic();
              go(1);
            }}
          >
            다음
          </Button>
        ) : (
          <Button
            size="lg"
            className="w-full"
            disabled={!canNext || submitting}
            onClick={submit}
          >
            {submitting ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Sparkles className="size-5" />
            )}
            {submitting ? "맞춤 동선 만드는 중" : "맞춤 동선 만들기"}
          </Button>
        )}
      </div>

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
