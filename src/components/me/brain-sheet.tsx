"use client";

import { useEffect, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import { api } from "@/lib/api/client";
import { ValueMindMap } from "@/components/me/value-mindmap";
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

  // 값 가치만(카테고리 slug 레거시 제외) + confidence 순.
  const nodes = (brain?.interests ?? [])
    .filter((n) => valueDef(n.key))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
  const empty = !loading && nodes.length === 0;

  async function addValue(slug: string) {
    if (saving) return;
    setSaving(true);
    try {
      await api.post("/api/me/values", { values: [slug] });
      load();
    } catch {
      // 무시 — 로컬 반영 실패해도 조용히.
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
              <RoamMotion src="/head.mp4" />
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
            <ValueMindMap nodes={nodes} label={(s) => t(`values.${s}`)} />

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
                  {t("myPage.addHint")}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {VALUE_TAGS.map((v) => (
                    <button
                      key={v.slug}
                      type="button"
                      disabled={saving}
                      onClick={() => addValue(v.slug)}
                      className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold active:opacity-70 disabled:opacity-50"
                      style={{ color: v.color }}
                    >
                      {t(`values.${v.slug}`)}
                    </button>
                  ))}
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
      </SheetContent>
    </Sheet>
  );
}
