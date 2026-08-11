"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { useAuthStore } from "@/lib/stores/auth";
import { Textarea } from "@/components/ui/textarea";
import { NotePhotos } from "@/components/booth/note-photos";
import { JudgmentBar } from "@/components/booth/judgment-bar";
import { useT } from "@/lib/i18n/provider";
import { boothValueSlugs } from "@/lib/values";
import type { Booth, Category } from "@/lib/types";

/**
 * Per-visitor controls for a booth: 판단(JudgmentBar, adaptive) + 메모 + 사진.
 * 지도 하단 시트와 같은 규칙을 쓴다 — 지도·상세가 어긋나면 사용자가 두 개의
 * 다른 앱으로 느낀다(judgment-vocabulary §3-4).
 */
export function BoothPersonalPanel({
  booth,
  category,
  exhibitionSlug,
}: {
  booth: Booth;
  category?: Category;
  exhibitionSlug: string;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const openLogin = useAuthStore((s) => s.openLogin);

  const setMemo = useVisitStore((s) => s.setMemo);

  const [memo, setLocalMemo] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const [syncKey, setSyncKey] = useState<string | null>(null);
  const curKey = `${booth.id}:${user ? "in" : "out"}`;
  if (syncKey !== curKey) {
    setSyncKey(curKey);
    setLocalMemo(useVisitStore.getState().records[booth.id]?.memo ?? "");
    setHydrated(true);
  }

  function onMemoBlur() {
    const prev = useVisitStore.getState().records[booth.id]?.memo ?? "";
    if (memo.trim() === prev.trim()) return;
    setMemo(booth.id, memo);
    void pushNote(booth.id, {}); // 메모만 바뀜 — interest·verdict는 안 건드린다
    toast.success(memo.trim() ? t("map.memoSaved") : t("map.memoCleared"));
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-base font-bold">{t("booth.recordHeading")}</h2>

      <JudgmentBar
        mode="adaptive"
        boothId={booth.id}
        boothName={booth.name}
        interestSlugs={boothValueSlugs(booth)}
        categoryLabel={category?.name}
        exhibitionSlug={exhibitionSlug}
      />

      <div className="relative">
        <NotebookPen className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Textarea
          value={memo}
          disabled={!hydrated}
          onChange={(e) => setLocalMemo(e.target.value)}
          onBlur={onMemoBlur}
          placeholder={t("notes.memoPlaceholder")}
          rows={2}
          maxLength={300}
          className="resize-none pl-9"
          aria-label={t("notes.memoAria")}
        />
      </div>

      <NotePhotos boothId={booth.id} />

      {ready && !user && (
        <p className="text-xs text-muted-foreground">
          이 기기에 저장돼.{" "}
          <button
            type="button"
            onClick={openLogin}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            로그인
          </button>
          하면 다른 기기와 동기화돼.
        </p>
      )}
    </section>
  );
}
