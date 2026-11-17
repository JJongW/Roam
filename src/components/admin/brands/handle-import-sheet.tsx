"use client";

import { useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { HANDLE_CONFIDENCE_LABEL } from "@/lib/brands/board";
import { IMPORT_DECISION_LABEL, type ImportDecision, type ImportPlanLine } from "@/lib/brands/handle-import";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Result = { plan: ImportPlanLine[]; summary: Record<ImportDecision, number>; applied: number; failures: { line: number; message: string }[] };

const ORDER: ImportDecision[] = ["fill", "conflict", "ambiguous", "unmatched", "same", "no-handle"];
const TONE: Record<ImportDecision, string> = {
  fill: "bg-success/20 text-foreground",
  same: "bg-secondary text-muted-foreground",
  conflict: "bg-warning/20 text-foreground",
  "no-handle": "bg-secondary text-muted-foreground",
  unmatched: "bg-destructive/10 text-destructive",
  ambiguous: "bg-warning/20 text-foreground",
};

/**
 * 인스타 계정 csv 가져오기. 파일을 고르면 미리보기만 하고, "적용"을 눌러야 브랜드 프로필
 * links 칸에 쓴다. 빈 칸만 채우고 이미 다른 계정이 있으면 건드리지 않는다.
 */
export function HandleImportSheet({
  open,
  onClose,
  exhibition,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  exhibition: { id: string; name: string };
  onApplied: () => void;
}) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState<ImportDecision | null>(null);

  async function run(apply: boolean, f = file) {
    if (!f) return;
    setBusy(true);
    try {
      const r = await api.post<Result>("/api/admin/brands/contacts/import", {
        exhibitionId: exhibition.id,
        fileName: f.name,
        csv: f.text,
        apply,
      });
      setResult(r);
      if (apply) {
        toast.success(`${r.applied}곳의 인스타 계정을 넣었어요${r.failures.length ? `, ${r.failures.length}곳은 실패했어요` : ""}`);
        onApplied();
      }
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "읽지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  const close = () => {
    setFile(null);
    setResult(null);
    setShow(null);
    onClose();
  };
  const lines = result ? result.plan.filter((p) => (show ? p.decision === show : p.decision !== "same" && p.decision !== "no-handle")) : [];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>인스타 계정 가져오기</SheetTitle>
          <SheetDescription>
            {exhibition.name} 브랜드에 csv의 인스타 계정을 넣어요. 먼저 미리보기를 보고, 적용을 눌러야 저장돼요. 이미 다른 계정이 있는
            브랜드는 덮지 않아요.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-5 pt-3 pb-8">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 hover:bg-secondary/40">
            <FileUp className="size-5 text-muted-foreground" />
            <span className="text-sm">
              {file ? file.name : "csv 파일 고르기"}
              <span className="block text-xs text-muted-foreground">
                이름 칸(name_ko, team, name), 계정 칸(instagram), 신뢰도 칸(confidence: 확실, 높음, 후보)을 읽어요
              </span>
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const next = { name: f.name, text: await f.text() };
                setFile(next);
                setResult(null);
                setShow(null);
                run(false, next);
              }}
            />
          </label>

          {busy && !result && <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" />}

          {result && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {ORDER.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={show === d}
                    onClick={() => setShow(show === d ? null : d)}
                    className={cn(
                      "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold",
                      TONE[d],
                      show === d && "ring-2 ring-primary",
                    )}
                  >
                    {IMPORT_DECISION_LABEL[d]} <b className="tabular-nums">{result.summary[d]}</b>
                  </button>
                ))}
              </div>
              <div className="max-h-[45dvh] overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">줄</th>
                      <th className="px-2 py-2">이름</th>
                      <th className="px-2 py-2">csv 계정</th>
                      <th className="px-2 py-2">신뢰도</th>
                      <th className="px-2 py-2">지금 계정</th>
                      <th className="px-2 py-2">판단</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((l) => (
                      <tr key={l.line}>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground tabular-nums">{l.line}</td>
                        <td className="px-2 py-1.5">{l.name}</td>
                        <td className="px-2 py-1.5">{l.handle ? `@${l.handle}` : ""}</td>
                        <td className="px-2 py-1.5 text-xs">{l.confidence ? HANDLE_CONFIDENCE_LABEL[l.confidence] : ""}</td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{l.currentHandle ? `@${l.currentHandle}` : ""}</td>
                        <td className="px-2 py-1.5">
                          <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", TONE[l.decision])}>
                            {IMPORT_DECISION_LABEL[l.decision]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.failures.length > 0 && (
                <p className="text-sm text-destructive">
                  실패: {result.failures.map((f) => `${f.line}줄 ${f.message}`).join(", ")}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => run(true)} disabled={busy || result.summary.fill === 0 || result.applied > 0}>
                  {busy ? <Loader2 className="animate-spin" /> : `${result.summary.fill}곳 적용`}
                </Button>
                <span className="text-xs text-muted-foreground">
                  &quot;후보&quot;는 다시 볼 것으로 들어가요. 보내기 전에 프로필을 꼭 봐 주세요.
                </span>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
