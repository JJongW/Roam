"use client";

import { toast } from "sonner";
import { useVisitStore, pushRetro } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";

/**
 * 지도 부스 시트의 "여기 어땠어?" — '가봄'인데 아직 되묻기에 답 안 한 부스에만
 * 뜬다. 강제 아님: 무시하면 사라지고, 다음에 이 부스 시트를 다시 열면 또 뜬다.
 * 걷는 중엔 가봄·별로·끌림만 반사적으로 누르게 하고, 판단(호불호)은 여기서 따로
 * 받는다 — 지도 코치마크에 그 안내가 있다.
 */
export function VisitedRetroInline({ boothId }: { boothId: string }) {
  const t = useT();
  const record = useVisitStore((s) => s.records[boothId]);
  const setRetro = useVisitStore((s) => s.setRetro);
  const setTaste = useCompanionStore((s) => s.setTaste);

  if (record?.status !== "visited" || record?.retro) return null;

  function answer(liked: boolean) {
    setRetro(boothId, liked ? "liked" : "disliked");
    const prevJudged = useCompanionStore.getState().tasteJudged;
    void pushRetro(boothId, liked).then((taste) => {
      if (!taste) return;
      setTaste(taste.judgedCount, taste.pct);
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        toast.success(t("companion.tasteInsight"));
      }
    });
  }

  return (
    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-sm">
      <span className="text-muted-foreground">{t("map.retroPrompt")}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => answer(true)}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
        >
          {t("map.retroLiked")}
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
        >
          {t("map.retroDisliked")}
        </button>
      </div>
    </div>
  );
}
