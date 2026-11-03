"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import type { LinkRow, LinkSide } from "@/lib/brands/links";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";

function Side({ s }: { s: LinkSide }) {
  const ig = s.instagramUrl?.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
  return (
    <div className="flex items-start gap-3">
      {s.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={s.image} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
      ) : null}
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold">{s.name}</p>
        <p className="text-xs text-muted-foreground">
          {s.exhibitionName}
          {s.code ? `, 부스 ${s.code}` : ""}
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {ig && (
            <a href={s.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
              <AtSign className="size-3" />
              {ig}
            </a>
          )}
          {s.websiteUrl && (
            <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
              <ExternalLink className="size-3" />
              {s.websiteUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          )}
        </div>
        {s.summary && <p className="line-clamp-2 text-sm text-foreground/80">{s.summary}</p>}
      </div>
    </div>
  );
}

export function LinkQueue({ rows, rejectedCount }: { rows: LinkRow[]; rejectedCount: number }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"approved" | "rejected" | "scan" | null>(null);
  const allOn = rows.length > 0 && selected.size === rows.length;
  const someOn = selected.size > 0 && !allOn;
  const ids = useMemo(() => rows.map((r) => r.id), [rows]);

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    try {
      const r = await api.post<{ done: number; skipped: number; results: { id: string; error?: string }[] }>(
        "/api/admin/brands/links",
        { ids: [...selected], decision },
      );
      const verb = decision === "approved" ? "연결했어요" : "연결 안 함으로 뒀어요. 다시 묻지 않아요";
      if (r.skipped > 0) toast.warning(`${r.done}건 ${verb}. ${r.skipped}건은 이미 처리됐거나 하지 못했어요`);
      else toast.success(`${r.done}건 ${verb}`);
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "처리하지 못했어요");
    } finally {
      setBusy(null);
    }
  }

  async function scan() {
    setBusy("scan");
    try {
      const r = await api.post<{ summary: { candidates: number; assignments: number } }>("/api/admin/exhibitors/backfill", { apply: true });
      toast.success(`새로 찾은 짝 ${r.summary.candidates}건, 바로 이은 출전 ${r.summary.assignments}건이에요`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "찾지 못했어요");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        인스타나 웹 주소가 같은 곳은 이미 같은 브랜드로 이었어요. 여기는 이름만 같은 짝이에요. 이름이 같아도 다른 곳일 수
        있어서 나란히 놓고 골라요. 연결 안 함으로 둔 짝은 다시 묻지 않아요{rejectedCount > 0 ? `(지금까지 ${rejectedCount}건)` : ""}.
      </p>

      <div className="sticky top-14 z-10 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background/95 p-3 backdrop-blur md:top-0">
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allOn}
            ref={(el) => {
              if (el) el.indeterminate = someOn;
            }}
            onChange={() => setSelected(allOn ? new Set() : new Set(ids))}
            disabled={rows.length === 0}
            aria-label="전체 선택"
          />
          전체 선택
        </label>
        <span className="text-sm text-muted-foreground">
          {selected.size}/{rows.length}건 골랐어요
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button size="sm" disabled={selected.size === 0 || !!busy} onClick={() => decide("approved")}>
            {busy === "approved" ? <Loader2 className="animate-spin" /> : `선택한 ${selected.size}건 연결`}
          </Button>
          <Button size="sm" variant="outline" disabled={selected.size === 0 || !!busy} onClick={() => decide("rejected")}>
            {busy === "rejected" ? <Loader2 className="animate-spin" /> : "연결 안 함"}
          </Button>
          <Button size="sm" variant="ghost" disabled={!!busy} onClick={scan}>
            {busy === "scan" ? <Loader2 className="animate-spin" /> : "새 후보 찾기"}
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="확인할 짝이 없어요" description="새 박람회 목록이 들어오면 여기 쌓여요." bordered />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const on = selected.has(r.id);
            return (
              <Card key={r.id} className={on ? "space-y-3 p-4 ring-2 ring-primary/40" : "space-y-3 p-4"}>
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-primary"
                    checked={on}
                    onChange={() => toggle(r.id)}
                    aria-label={`${r.booth?.name ?? r.id}를 ${r.target.name}에 잇기 선택`}
                  />
                  <span className="text-sm font-semibold">
                    {r.booth ? `${r.booth.exhibitionName}의 "${r.booth.name}"` : "이 출전"}을 브랜드 &ldquo;{r.target.name}&rdquo;에 이어도 될까요?
                  </span>
                </label>
                <div className="flex flex-wrap gap-1.5 pl-7">
                  {(r.evidence.length ? r.evidence : [r.reason]).map((e) => (
                    <span key={e} className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                      {e}
                    </span>
                  ))}
                </div>
                <div className="grid gap-4 pl-7 md:grid-cols-2">
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-muted-foreground">이 출전</p>
                    {r.booth ? <Side s={r.booth} /> : <p className="text-sm">부스를 찾을 수 없어요</p>}
                  </div>
                  <div className="space-y-2 md:border-l md:border-border md:pl-4">
                    <p className="text-xs font-bold text-muted-foreground">
                      브랜드 {r.target.name}
                      {r.target.artistName ? `, 작가 ${r.target.artistName}` : ""}, 출전 {r.target.appearances.length}회
                    </p>
                    {r.target.appearances.map((s) => (
                      <Side key={s.boothId} s={s} />
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
