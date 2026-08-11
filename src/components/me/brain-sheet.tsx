"use client";

import { useEffect, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { api } from "@/lib/api/client";
import { TasteRadar } from "@/components/me/taste-radar";
import { useT } from "@/lib/i18n/provider";
import { VALUE_TAGS, valueDef } from "@/lib/values";
import { RoamMotion } from "@/components/companion/roam-motion";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LegalLinks } from "@/components/common/legal-links";
import type { UserBrain } from "@/lib/types";

/**
 * 내 취향(마이페이지) — L4 브레인의 관람 가치를 로미 중심 마인드맵으로 보여준다.
 * 노드 크기 = confidence. "관심 고치기"로 8가치를 눌러 추가(POST /api/me/values). 로그인
 * 정체성이 드러나는 컴팩트한 공간(companion-reframe §5-f). 회고=순간, 이건 누적된 나.
 */
export function BrainSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [brain, setBrain] = useState<UserBrain | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  function load() {
    api
      .get<{ data: UserBrain }>("/api/me/brain")
      .then((r) => setBrain(r.data))
      .catch(() => setBrain(null))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api
      .get<{ data: UserBrain }>("/api/me/brain")
      .then((r) => !cancelled && setBrain(r.data))
      .catch(() => !cancelled && setBrain(null))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open]);

  // 레이더는 8축을 항상 그리므로 slug → confidence 맵만 주면 된다. 뮤트된 가치는
  // 서버 증류에서 이미 빠져 있으므로(distill.ts) 여기서 또 거르지 않는다.
  const values: Record<string, number> = {};
  for (const n of brain?.interests ?? []) {
    if (valueDef(n.key)) values[n.key] = n.confidence;
  }
  const muted = new Set(brain?.mutedSlugs ?? []);
  // "비었다"의 기준은 그릴 값이 하나도 없을 때다 — 축은 늘 8개라 노드 수로는 못 센다.
  const empty = !loading && Object.keys(values).length === 0;

  /**
   * 켜진 가치는 끄고(뮤트), 꺼진 가치는 켠다.
   *
   * 켤 때 값이 하나도 없으면 명시 긍정 신호도 같이 남긴다 — 뮤트만 풀어봐야
   * 쌓인 게 없으면 여전히 0이라 화면이 안 변하고, 사용자는 또 "반응이 없다"고
   * 느낀다.
   *
   * 낙관적 갱신은 하지 않는다. confidence는 서버 증류 결과가 유일한 진실이라
   * (취향 정확도와 같은 규칙) 임의로 그려두면 새로고침 때 값이 튄다.
   */
  async function toggleValue(slug: string, on: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      await api.put(`/api/me/values/${slug}`, { muted: on });
      if (!on && (values[slug] ?? 0) === 0) {
        await api.post("/api/me/values", { values: [slug] });
      }
      load();
    } catch {
      // 무시 — 실패해도 다음 load에서 서버 값으로 맞춰진다.
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="px-5 pb-8">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
              <RoamMotion src="/walk_think.webm" />
            </span>
            {t("myPage.title")}
          </SheetTitle>
          <SheetDescription>{t("myPage.desc")}</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="mx-auto mt-6 size-64 animate-pulse rounded-full bg-secondary" />
        ) : empty || !brain ? (
          <p className="mb-2 mt-10 text-center text-sm leading-relaxed text-muted-foreground">
            {t("myPage.empty")}
          </p>
        ) : (
          <>
            <TasteRadar values={values} label={(s) => t(`values.${s}`)} />

            <div className="mt-3 flex items-center justify-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {t("myPage.stats", {
                  v: brain.literacy.visitsCount,
                  b: brain.literacy.boothsSeenCount,
                })}
              </span>
            </div>

            {editing && (
              <div className="mt-4">
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  {t("myPage.editHint")}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {VALUE_TAGS.map((v) => {
                    // 켜짐 = 값이 있고 뮤트도 아님. 이 상태에서만 뺄 수 있다.
                    const on = !muted.has(v.slug) && (values[v.slug] ?? 0) > 0;
                    return (
                      <button
                        key={v.slug}
                        type="button"
                        data-testid={`value-toggle-${v.slug}`}
                        disabled={saving}
                        aria-pressed={on}
                        onClick={() => toggleValue(v.slug, on)}
                        className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold active:opacity-70 disabled:opacity-50"
                        style={{
                          color: on ? v.color : "var(--muted-foreground)",
                          borderColor: on ? v.color : "var(--border)",
                        }}
                      >
                        {t(`values.${v.slug}`)}
                        <span aria-hidden>{on ? "×" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <div className="mt-5 flex gap-2">
          {!empty && brain && (
            <Button
              variant="outline"
              size="lg"
              className="flex-1"
              onClick={() => setEditing((e) => !e)}
            >
              <Pencil className="size-4" aria-hidden />
              {saving
                ? t("myPage.saving")
                : editing
                  ? t("myPage.editDone")
                  : t("myPage.edit")}
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>

        <LegalLinks className="mt-4" />
      </SheetContent>
    </Sheet>
  );
}
