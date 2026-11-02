import { getRepository } from "@/lib/repositories";
import { AdminSection } from "@/components/admin/section";
import { AutoRefresh } from "@/components/admin/auto-refresh";
import { SURVEY_ID } from "@/lib/survey/questions";
import { formatDuration, summarizeSurvey } from "@/lib/survey/aggregate";

export const metadata = { title: "설문" };
// 응답이 들어올 때마다 새로 센다 — 캐시하면 방금 들어온 응답이 안 보인다.
export const dynamic = "force-dynamic";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** 공개 설문(`/survey`) 결과. 관리자 게이트(레이아웃) 뒤에서만 열린다. */
export default async function SurveyResultsPage() {
  const repo = await getRepository();
  let rows;
  try {
    rows = await repo.listSurveyResponses(SURVEY_ID);
  } catch (e) {
    // 0060 마이그레이션 전이면 테이블이 없다 — "0명"으로 보이면 안 된다.
    return (
      <p className="text-destructive">
        설문 응답을 읽지 못했어요: {e instanceof Error ? e.message : String(e)}
      </p>
    );
  }
  const s = summarizeSurvey(rows);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">설문 결과</h1>
          <p className="text-sm text-muted-foreground">
            <a href="/survey" target="_blank" rel="noreferrer" className="underline">/survey</a> 응답 · 30초마다 새로 셉니다
          </p>
        </div>
        <AutoRefresh seconds={30} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["전체 응답", String(s.total)],
          ["오늘", String(s.today)],
          ["마지막 응답", s.lastAt ? fmt(s.lastAt) : "없음"],
        ].map(([k, v]) => (
          <div key={k} className="min-w-0 rounded-xl border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">{k}</p>
            <p className="mt-1 truncate text-xl font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <AdminSection
        title="답하는 데 걸린 시간"
        description={`페이지를 연 뒤 "답변 보내기"까지 · ${s.duration.measured}명 측정`}
      >
        {s.duration.measured === 0 ? (
          <p className="text-sm text-muted-foreground">아직 없어요.</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-x-8 gap-y-2">
              <p className="text-sm">
                <span className="text-muted-foreground">중간값 </span>
                <span className="text-lg font-bold tabular-nums">{formatDuration(s.duration.medianMs ?? 0)}</span>
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">1분 안에 끝낸 사람 </span>
                <span className="text-lg font-bold tabular-nums">{s.duration.underMinutePct}%</span>
              </p>
            </div>
            <ul className="space-y-2">
              {s.duration.buckets.map((b) => {
                const pct = Math.round((b.count / s.duration.measured) * 100);
                return (
                  <li key={b.label} className="grid grid-cols-[6rem_1fr_4.5rem] items-center gap-2 text-sm">
                    <span>{b.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                      <span className="block h-full bg-primary/60" style={{ width: `${pct}%` }} />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{b.count} · {pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </AdminSection>

      <div className="grid gap-4 md:grid-cols-2">
        {s.questions.map(({ question, answered, options }) => {
          const top = Math.max(0, ...options.map((o) => o.count));
          return (
            <AdminSection
              key={question.key}
              title={question.short}
              description={`${answered}명 답함${question.multi ? " · 여러 개 선택" : ""}`}
            >
              <ul className="space-y-2">
                {options.map((o) => (
                  <li key={o.value} className="grid grid-cols-[minmax(0,10rem)_1fr_4.5rem] items-center gap-2 text-sm">
                    <span className="truncate" title={o.label}>{o.label}</span>
                    <span className="h-2 overflow-hidden rounded-full bg-muted">
                      <span
                        className={o.count && o.count === top ? "block h-full bg-primary" : "block h-full bg-primary/40"}
                        style={{ width: `${o.pct}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">
                      {o.count} · {o.pct}%
                    </span>
                  </li>
                ))}
              </ul>
            </AdminSection>
          );
        })}
      </div>

      <AdminSection title="불편했던 점·바라는 점" description={`${s.comments.length}개 · 최근 순`}>
        {s.comments.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 없어요.</p>
        ) : (
          <ul className="space-y-2">
            {s.comments.map((c, i) => (
              <li key={i} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <p className="whitespace-pre-wrap">{c.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">{fmt(c.at)}</p>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
