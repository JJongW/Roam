"use client";

import { useEffect, useState } from "react";
import { MapPin, Pencil, RotateCcw } from "lucide-react";
import { api } from "@/lib/api/client";
import { TasteRadar } from "@/components/me/taste-radar";
import { useT } from "@/lib/i18n/provider";
import { VALUE_TAGS, valueDef } from "@/lib/values";
import { RoamMotion } from "@/components/companion/roam-motion";
import { useAuthStore } from "@/lib/stores/auth";
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
 * 내 취향(마이페이지) — L4 브레인의 관람 가치를 8축 취향 레이더로 보여준다.
 * "관심 고치기"로 8가치를 켜고 끈다(PUT /api/me/values/[slug]). 로그인 정체성이
 * 드러나는 컴팩트한 공간(companion-reframe §5-f). 회고=순간, 이건 누적된 나.
 */
export function BrainSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const restartAppOnboarding = useAuthStore((s) => s.restartAppOnboarding);
  const [brain, setBrain] = useState<UserBrain | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // 처음 온보딩을 다시 보여준다 — 이 시트를 닫아야 그 아래 전체화면 게이트가 뜬다.
  function restartOnboarding() {
    onClose();
    restartAppOnboarding();
  }

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
  /**
   * "기록이 없다" 안내를 띄울 조건. 그릴 값이 없다는 것만으로는 부족하다 — 8가치를
   * 전부 꺼도 values가 비고, 그때 안내로 화면을 갈아치우면 다시 켤 버튼까지 사라져
   * 되돌릴 길이 없는 일방통행이 된다(앱 어디에도 다른 해제 UI가 없다). 게다가
   * 이력은 멀쩡히 남아 있으니 "기록이 없다"는 말 자체가 거짓이다. 뮤트한 게 하나도
   * 없는 진짜 첫 사용자에게만, 레이더를 가리지 않고 캡션으로 얹는다.
   */
  const noHistory =
    !!brain && Object.keys(values).length === 0 && muted.size === 0;

  /**
   * 켜진 가치는 끄고(뮤트), 꺼진 가치는 켠다.
   *
   * 명시 긍정 신호를 같이 남길지는 **서버가 정한다**(PUT 응답의 needsSeed).
   * 예전엔 여기서 `(values[slug] ?? 0) === 0`으로 판단했는데, 뮤트된 가치는 애초에
   * interests에서 빠져 내려와 이 값이 영원히 0이라 조건이 구조적으로 항상 참이었다 —
   * 이력이 두둑한 가치도 껐다 켤 때마다 신호가 하나씩 더 쌓였다.
   *
   * 낙관적 갱신은 하지 않는다. confidence는 서버 증류 결과가 유일한 진실이라
   * (취향 정확도와 같은 규칙) 임의로 그려두면 새로고침 때 값이 튄다.
   */
  async function toggleValue(slug: string, on: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.put<{ needsSeed: boolean } | undefined>(
        `/api/me/values/${slug}`,
        { muted: on },
      );
      // 쌓인 게 정말 없을 때만 시드한다 — 뮤트만 풀면 여전히 0이라 화면이 안 변하고
      // 사용자는 또 "반응이 없다"고 느낀다.
      if (res?.needsSeed) {
        await api.post("/api/me/values", { values: [slug] });
      }
    } catch {
      // 무시 — 아래 load()가 서버 값으로 되맞춘다.
    } finally {
      // PUT은 성공했는데 뒤이은 POST만 실패하는 경우가 있다. 그때도 화면은 이미
      // 반영된 서버 상태를 따라가야 한다 — try 안에 두면 이 경로에서 load()가
      // 통째로 건너뛰어져 토글이 안 먹은 것처럼 보인다.
      load();
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

        {/* 브레인만 있으면 무조건 레이더를 그린다. 값이 하나도 없어도 8축은 0으로
            멀쩡히 그려지고(taste-radar), 그래야 "고치기"로 다시 켜는 길이 남는다. */}
        {loading ? (
          <div className="mx-auto mt-6 size-64 animate-pulse rounded-full bg-secondary" />
        ) : !brain ? (
          <p className="mb-2 mt-10 text-center text-sm leading-relaxed text-muted-foreground">
            {t("myPage.empty")}
          </p>
        ) : (
          <>
            <TasteRadar values={values} label={(s) => t(`values.${s}`)} />

            {noHistory && (
              <p className="mt-3 text-center text-sm leading-relaxed text-muted-foreground">
                {t("myPage.empty")}
              </p>
            )}

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
          {brain && (
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

        <button
          type="button"
          onClick={restartOnboarding}
          className="mt-3 flex w-full items-center justify-center gap-1.5 py-2 text-xs font-medium text-muted-foreground active:opacity-70"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          {t("myPage.restartOnboarding")}
        </button>

        <LegalLinks className="mt-4" />
      </SheetContent>
    </Sheet>
  );
}
