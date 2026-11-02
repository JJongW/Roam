"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SURVEY_COMMENT_MAX,
  SURVEY_QUESTIONS,
  type SurveyQuestion,
} from "@/lib/survey/questions";

type Answers = Record<string, string | string[]>;

export function SurveyForm() {
  const [answers, setAnswers] = useState<Answers>({});
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  // 페이지를 연 시각 — 제출까지 걸린 시간을 잰다("1분이면 끝나요"가 맞는지).
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  function pick(q: SurveyQuestion, value: string) {
    setMissing((m) => m.filter((k) => k !== q.key));
    setAnswers((prev) => {
      if (!q.multi) return { ...prev, [q.key]: value };
      const cur = Array.isArray(prev[q.key]) ? (prev[q.key] as string[]) : [];
      if (cur.includes(value)) return { ...prev, [q.key]: cur.filter((v) => v !== value) };
      // "두 개까지" — 넘치면 가장 먼저 고른 것을 푼다.
      const next = [...cur, value];
      return { ...prev, [q.key]: q.max ? next.slice(-q.max) : next };
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const empty = SURVEY_QUESTIONS.filter((q) => {
      const v = answers[q.key];
      return Array.isArray(v) ? v.length === 0 : !v;
    }).map((q) => q.key);
    setMissing(empty);
    if (empty.length) {
      document.getElementById(`q-${empty[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setState("sending");
    try {
      const res = await fetch("/api/survey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers,
          comment: comment.trim() || undefined,
          durationMs: openedAt.current == null ? undefined : Date.now() - openedAt.current,
        }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <section className="rounded-2xl border border-border bg-card px-5 py-10 text-center" role="status">
        <p className="text-xl font-bold">답변 고맙습니다!</p>
        <p className="mt-2 text-muted-foreground">지도 만드는 데 잘 쓸게요.</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {SURVEY_QUESTIONS.map((q, i) => {
        const isMissing = missing.includes(q.key);
        return (
          <fieldset
            key={q.key}
            id={`q-${q.key}`}
            className={cn(
              "flex min-w-0 flex-col gap-3 rounded-2xl border bg-card p-4",
              isMissing ? "border-destructive" : "border-border",
            )}
          >
            <legend className="sr-only">{q.title}</legend>
            <p aria-hidden className="text-[16px] font-bold leading-snug">
              {i + 1}. {q.title}
              {q.multi && (
                <span className="ml-2 whitespace-nowrap rounded-full bg-primary/10 px-2 py-0.5 align-middle text-xs font-medium text-primary">
                  {q.max ? `${q.max}개까지` : "여러 개 골라도 돼요"}
                </span>
              )}
            </p>
            {q.hint && !q.max && <p className="-mt-2 text-sm text-muted-foreground">{q.hint}</p>}
            <div role={q.multi ? "group" : "radiogroup"} aria-label={q.title} className={cn("grid gap-2", q.visual ? "grid-cols-2" : "grid-cols-1")}>
              {q.options.map((o) => {
                const v = answers[q.key];
                const on = Array.isArray(v) ? v.includes(o.value) : v === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role={q.multi ? "checkbox" : "radio"}
                    aria-checked={on}
                    onClick={() => pick(q, o.value)}
                    className={cn(
                      "flex min-h-11 min-w-0 flex-col gap-2 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left transition-colors",
                      on ? "border-primary bg-primary/10" : "border-border hover:border-muted-foreground/50",
                    )}
                  >
                    {q.visual && <Visual kind={q.visual} value={o.value} />}
                    <span className="text-[15px] font-semibold">{o.label}</span>
                    {o.sub && <span className="-mt-1.5 text-[13px] text-muted-foreground">{o.sub}</span>}
                  </button>
                );
              })}
            </div>
            {isMissing && <p className="text-sm text-destructive">답을 골라 주세요.</p>}
          </fieldset>
        );
      })}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
        <label htmlFor="survey-comment" className="text-[16px] font-bold leading-snug">
          {SURVEY_QUESTIONS.length + 1}. 전시장에서 불편했던 점이나 바라는 점을 적어주세요{" "}
          <span className="font-normal text-muted-foreground">(선택)</span>
        </label>
        <Textarea
          id="survey-comment"
          value={comment}
          maxLength={SURVEY_COMMENT_MAX}
          onChange={(e) => setComment(e.target.value)}
          placeholder="예: 부스 번호로 찾는 게 어려웠어요"
        />
      </div>

      <Button type="submit" size="lg" disabled={state === "sending"} className="w-full">
        {state === "sending" ? "보내는 중…" : "답변 보내기"}
      </Button>
      {missing.length > 0 && (
        <p className="text-center text-sm text-destructive" role="alert">
          아직 안 고른 질문이 {missing.length}개 있어요.
        </p>
      )}
      {state === "error" && (
        <p className="text-center text-sm text-destructive" role="alert">
          보내지 못했어요. 잠시 뒤 다시 눌러 주세요.
        </p>
      )}
    </form>
  );
}

/** 지도 보기 질문의 작은 그림 — 실제 지도 부스 칸처럼 코드가 위, 이름이 아래다. */
function Visual({ kind, value }: { kind: "wrap" | "entry"; value: string }) {
  if (kind === "wrap") {
    const wrapped = value === "word-wrap";
    const booths = wrapped
      ? [["B28", "제닉스", "(프랑스그룹)"], ["L70", "허리펴자", "허리체어"]]
      : [["B28", "제닉스(프랑스그…"], ["L70", "허리펴자허리체어"]];
    return (
      <span aria-hidden className="flex justify-center gap-1.5 rounded-lg bg-muted/60 p-2.5">
        {booths.map(([code, ...name]) => (
          <span
            key={code}
            className="flex h-16 w-12 flex-col items-center justify-center overflow-hidden rounded border border-border bg-background text-center leading-[1.16]"
          >
            <span className={cn("text-muted-foreground", wrapped ? "text-[8px]" : "text-[4.5px]")}>{code}</span>
            {name.map((n) => (
              <span key={n} className={cn("font-semibold", wrapped ? "text-[10px]" : "text-[5.5px]")}>{n}</span>
            ))}
          </span>
        ))}
      </span>
    );
  }
  const whole = value === "whole";
  return (
    <span aria-hidden className="relative block h-24 overflow-hidden rounded-lg bg-muted/60">
      {whole ? (
        <>
          {[0, 1, 2, 3].map((c) =>
            [0, 1].map((r) => (
              <span
                key={`${c}-${r}`}
                className="absolute rounded-sm border border-border bg-background"
                style={{ left: `${8 + c * 22}%`, top: `${10 + r * 32}%`, width: "18%", height: "24%" }}
              />
            )),
          )}
          <span className="absolute bottom-[6%] left-[40%] rounded-full bg-primary px-1.5 text-[7px] font-bold text-primary-foreground">입구</span>
        </>
      ) : (
        <>
          <span className="absolute left-[-10%] top-[4%] flex h-[50%] w-[48%] items-center justify-center rounded border border-border bg-background text-[11px] font-semibold">보루네오</span>
          <span className="absolute left-[44%] top-[4%] flex h-[50%] w-[48%] items-center justify-center rounded border border-border bg-background text-[11px] font-semibold">에몬스가구</span>
          <span className="absolute bottom-[8%] left-[30%] rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">↑ 입구</span>
        </>
      )}
    </span>
  );
}
