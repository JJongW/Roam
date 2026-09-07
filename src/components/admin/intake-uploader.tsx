"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { intakeFileSchema } from "@/lib/intake/schema";
import type { IntakePlan } from "@/lib/intake/plan";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";

interface IntakeResponse {
  plan: IntakePlan;
  applied: {
    createdBooths: number;
    filledBooths: number;
    createdHalls: number;
    createdCategories: number;
    failures: { code: string; message: string }[];
  } | null;
}

export function IntakeUploader() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<IntakeResponse | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(file: File) {
    setResult(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast.error("JSON으로 읽을 수 없는 파일입니다");
      return;
    }
    // 서버에 보내기 전에 여기서 한 번 거른다 — 형식이 틀린 걸 왕복시킬 이유가 없다.
    const check = intakeFileSchema.safeParse(parsed);
    if (!check.success) {
      const first = check.error.issues[0];
      toast.error(`형식 오류: ${first.path.join(".")} — ${first.message}`);
      return;
    }
    setRaw(check.data);
    setFileName(file.name);
    await send(check.data, false, false);
  }

  async function send(file: unknown, apply: boolean, ow: boolean) {
    setBusy(true);
    try {
      const res = await api.post<IntakeResponse>("/api/admin/intake", {
        file,
        apply,
        overwrite: ow,
      });
      setResult(res);
      if (apply) {
        const a = res.applied!;
        toast.success(
          `신규 ${a.createdBooths} · 채움 ${a.filledBooths}${
            a.failures.length ? ` · 실패 ${a.failures.length}` : ""
          }`,
        );
      }
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.message : "인입에 실패했습니다",
      );
    } finally {
      setBusy(false);
    }
  }

  const plan = result?.plan;
  const applied = result?.applied;

  return (
    <div className="space-y-5">
      <Card className="flex flex-col gap-3 p-5">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pick(f);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => fileRef.current?.click()} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            정규형 파일 선택
          </Button>
          {fileName && (
            <span className="text-sm text-muted-foreground">{fileName}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          좌표는 파일이 아니라 도면(FLOORPLANS)에서 부스 코드로 가져옵니다. 고르면
          바로 미리보기만 계산하고, 아무것도 쓰지 않습니다.
        </p>
      </Card>

      {plan && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="신규 부스" value={plan.creates.length} />
            <Stat label="채울 부스" value={plan.fills.length} />
            <Stat
              label="충돌"
              value={plan.conflicts.length}
              tone={plan.conflicts.length ? "warn" : undefined}
            />
            <Stat
              label="오류"
              value={plan.errors.length}
              tone={plan.errors.length ? "bad" : undefined}
            />
          </div>

          {(plan.newHalls.length > 0 || plan.newCategories.length > 0) && (
            <Card className="flex flex-wrap items-center gap-2 p-4">
              <span className="text-sm font-bold">새로 만들 것</span>
              {plan.newHalls.map((h) => (
                <Chip key={h}>홀 · {h}</Chip>
              ))}
              {plan.newCategories.map((c) => (
                <Chip key={c.slug}>
                  분야 · {c.name} ({c.slug})
                </Chip>
              ))}
            </Card>
          )}

          <IssueList
            title={`오류 ${plan.errors.length}건 — 이 부스는 건너뜁니다`}
            rows={plan.errors.map((e) => ({ key: e.code, text: e.message }))}
            tone="bad"
          />
          <IssueList
            title={`충돌 ${plan.conflicts.length}건 — 기본은 쓰지 않습니다`}
            rows={plan.conflicts.map((c, i) => ({
              key: `${c.code}-${c.field}-${i}`,
              text: `${c.code} · ${c.field}`,
              detail: `현재 ${JSON.stringify(c.current)} → 파일 ${JSON.stringify(
                c.incoming,
              )}`,
            }))}
            tone="warn"
          />
          <IssueList
            title={`경고 ${plan.warnings.length}건`}
            rows={plan.warnings.map((w, i) => ({ key: String(i), text: w }))}
            tone="warn"
          />

          <Card className="flex flex-col gap-3 p-5">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => {
                  setOverwrite(e.target.checked);
                  if (raw) void send(raw, false, e.target.checked);
                }}
                className="size-4 accent-[var(--primary)]"
              />
              충돌도 덮어쓰기 — 사람이 쓴 값이 파일 값으로 바뀝니다
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                onClick={() => raw && void send(raw, true, overwrite)}
                disabled={
                  busy ||
                  (plan.creates.length === 0 && plan.fills.length === 0)
                }
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                적용
              </Button>
              <span className="text-sm text-muted-foreground">
                바뀌지 않는 부스 {plan.unchanged}곳
              </span>
            </div>
          </Card>

          {applied && (
            <Card className="flex flex-col gap-2 p-5">
              <p className="font-bold">
                적용됨 — 부스 신규 {applied.createdBooths} · 채움{" "}
                {applied.filledBooths} · 홀 {applied.createdHalls} · 분야{" "}
                {applied.createdCategories}
              </p>
              {applied.failures.length > 0 && (
                <ul className="space-y-1 text-sm text-destructive">
                  {applied.failures.map((f, i) => (
                    <li key={i}>
                      {f.code} — {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "bad";
}) {
  return (
    <Card className="p-4">
      <p
        className={
          tone === "bad"
            ? "text-2xl font-extrabold tabular text-destructive"
            : tone === "warn"
              ? "text-2xl font-extrabold tabular text-warning"
              : "text-2xl font-extrabold tabular"
        }
      >
        {value}
      </p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </Card>
  );
}

function IssueList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: { key: string; text: string; detail?: string }[];
  tone: "warn" | "bad";
}) {
  if (rows.length === 0) return null;
  return (
    <Card className="flex flex-col gap-2 p-4">
      <p className="flex items-center gap-2 font-bold">
        <AlertTriangle
          className={
            tone === "bad"
              ? "size-4 shrink-0 text-destructive"
              : "size-4 shrink-0 text-warning"
          }
        />
        {title}
      </p>
      <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
        {rows.map((r) => (
          <li key={r.key} className="border-b border-border pb-1 last:border-0">
            <span className="font-medium">{r.text}</span>
            {r.detail && (
              <span className="block text-muted-foreground">{r.detail}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
