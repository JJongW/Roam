"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";

interface PendingBooth {
  boothId: string;
  boothName: string;
}

/**
 * 관람 마치기 되묻기 — 두 묶음(judgment-vocabulary §7).
 *
 * 1) 다녀왔는데(visitedAt) 아직 판정(verdict) 없는 부스 → "여기 어땠어?" +
 *    좋았어/그냥그랬어/아니었어 3칸.
 * 2) 꼭 갈래로 찍어뒀는데 아직 안 간 부스 → "여기 가봤어?" 예/아니오. 예를
 *    누르면 그 자리에서 verdict 3칸이 펼쳐진다. **단정하지 않는다** — 안
 *    답하면 채점에서 빠질 뿐 "못 갔다"로 기록하지 않는다.
 *
 * 둘 다 없으면 즉시 onDone(). 답한 부스는 목록에서 바로 빠진다.
 */
export function VisitedRetroPrompt({
  exhibitionSlug,
  onDone,
}: {
  exhibitionSlug: string;
  onDone: () => void;
}) {
  const t = useT();
  const setVerdict = useVisitStore((s) => s.setVerdict);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const [askVerdict, setAskVerdict] = useState<PendingBooth[] | null>(null);
  const [askVisited, setAskVisited] = useState<PendingBooth[] | null>(null);
  const [expandedVisited, setExpandedVisited] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ pending: PendingBooth[] }>(
        `/api/me/notes/pending-retro?exhibitionSlug=${encodeURIComponent(exhibitionSlug)}`,
      ),
      api.get<{ pending: PendingBooth[] }>(
        `/api/me/notes/must-not-visited?exhibitionSlug=${encodeURIComponent(exhibitionSlug)}`,
      ),
    ])
      .then(([v, m]) => {
        if (cancelled) return;
        setAskVerdict(v.pending);
        setAskVisited(m.pending);
      })
      .catch(() => {
        if (cancelled) return;
        setAskVerdict([]);
        setAskVisited([]);
      });
    return () => {
      cancelled = true;
    };
  }, [exhibitionSlug]);

  const loaded = askVerdict !== null && askVisited !== null;
  useEffect(() => {
    if (loaded && askVerdict!.length === 0 && askVisited!.length === 0)
      onDone();
  }, [loaded, askVerdict, askVisited, onDone]);

  function answerVerdict(boothId: string, verdict: "good" | "ok" | "bad") {
    setAskVerdict((prev) =>
      prev ? prev.filter((b) => b.boothId !== boothId) : prev,
    );
    setVerdict(boothId, verdict);
    const prevJudged = useCompanionStore.getState().tasteJudged;
    void pushNote(boothId, { verdict: true }).then((taste) => {
      if (!taste) return;
      setTaste(taste.judgedCount, taste.pct);
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        useCompanionStore.getState().say(t("companion.tasteInsight"));
      }
    });
  }

  function answerVisitedNo(boothId: string) {
    // "못 갔다"로 기록하지 않는다 — 그냥 목록에서 뺀다. 무반응과 동치.
    setAskVisited((prev) =>
      prev ? prev.filter((b) => b.boothId !== boothId) : prev,
    );
  }

  if (!loaded || (askVerdict!.length === 0 && askVisited!.length === 0))
    return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      {askVerdict!.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">{t("companion.retroBatchTitle")}</p>
          <ul className="space-y-2">
            {askVerdict!.map((b) => (
              <li
                key={b.boothId}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <span className="truncate text-sm font-semibold">
                  {b.boothName}
                </span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => answerVerdict(b.boothId, "good")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold active:bg-accent/40"
                  >
                    {t("judge.good")}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerVerdict(b.boothId, "ok")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold active:bg-accent/40"
                  >
                    {t("judge.ok")}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerVerdict(b.boothId, "bad")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold active:bg-accent/40"
                  >
                    {t("judge.bad")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {askVisited!.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">
            {t("companion.retroVisitedTitle")}
          </p>
          <ul className="space-y-2">
            {askVisited!.map((b) => {
              const expanded = expandedVisited.has(b.boothId);
              return (
                <li
                  key={b.boothId}
                  className="space-y-1.5 rounded-xl border border-border px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">
                      {b.boothName}
                    </span>
                    {!expanded && (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedVisited((prev) =>
                              new Set(prev).add(b.boothId),
                            )
                          }
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
                        >
                          {t("companion.retroVisitedYes")}
                        </button>
                        <button
                          type="button"
                          onClick={() => answerVisitedNo(b.boothId)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
                        >
                          {t("companion.retroVisitedNo")}
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => answerVerdict(b.boothId, "good")}
                        className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold active:bg-accent/40"
                      >
                        {t("judge.good")}
                      </button>
                      <button
                        type="button"
                        onClick={() => answerVerdict(b.boothId, "ok")}
                        className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold active:bg-accent/40"
                      >
                        {t("judge.ok")}
                      </button>
                      <button
                        type="button"
                        onClick={() => answerVerdict(b.boothId, "bad")}
                        className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold active:bg-accent/40"
                      >
                        {t("judge.bad")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={onDone}
        className="w-full text-center text-xs font-semibold text-muted-foreground active:opacity-70"
      >
        {t("companion.retroBatchSkip")}
      </button>
    </div>
  );
}
