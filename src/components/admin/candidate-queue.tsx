"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Textarea } from "@/components/ui/textarea";
import { VALUE_TAGS } from "@/lib/values";
import { reviewPolicy } from "@/lib/enrichment/review-policy";
import type { EnrichmentCandidate } from "@/lib/types";

/** 라우트의 REJECT_REASONS와 짝이다 — 코드가 바뀌면 여기도 바꾼다. */
const REJECT_REASONS: Record<string, string> = {
  wrong_fact: "사실이 틀렸다",
  no_evidence: "근거 없이 지어냈다",
  voice: "말투가 아니다",
  vague: "두루뭉술하다",
  duplicate: "다른 부스와 같다",
};

const VALUE_LABEL: Record<string, string> = Object.fromEntries(
  VALUE_TAGS.map((v) => [v.slug, v.label]),
);

/** 신뢰도 띠 — 숫자만 보면 무엇을 먼저 볼지 모른다. */
function confidenceChip(c: number) {
  if (c >= 0.8) return { label: "높음", color: "#0f9d63" };
  if (c >= 0.5) return { label: "보통", color: "#b57200" };
  return { label: "낮음", color: "#d92d20" };
}

const FIELD_LABEL: Record<string, string> = {
  summary: "요약",
  roamInterpretation: "로미 한 줄",
  valueTags: "가치 태그",
  recommendationReasons: "가치별 근거",
  thingsToDo: "할 것",
  timing: "타이밍",
  memoryHooks: "기억 단서",
};

function isBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/** 검수자가 읽고 판단할 수 있는 형태로. 원시 JSON은 아래 편집 칸에만 둔다. */
function renderValue(field: string, value: unknown) {
  if (field === "valueTags" && Array.isArray(value)) {
    return (
      <span className="flex flex-wrap gap-1.5">
        {(value as { slug: string; strength: number }[]).map((v) => (
          <Chip key={v.slug} size="sm">
            {VALUE_LABEL[v.slug] ?? v.slug} {v.strength}
          </Chip>
        ))}
      </span>
    );
  }
  if (field === "recommendationReasons" && value && typeof value === "object") {
    return (
      <ul className="space-y-1">
        {Object.entries(value as Record<string, string>).map(([slug, line]) => (
          <li key={slug}>
            <span className="text-muted-foreground">
              {VALUE_LABEL[slug] ?? slug}
            </span>{" "}
            {line}
          </li>
        ))}
      </ul>
    );
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-0.5 pl-4">
        {value.map((v, i) => (
          <li key={i}>{typeof v === "string" ? v : JSON.stringify(v)}</li>
        ))}
      </ul>
    );
  }
  return (
    <span className="whitespace-pre-wrap">
      {typeof value === "string" ? value : JSON.stringify(value)}
    </span>
  );
}

/** 검수 상태를 한 눈에 — 대기·반영·반려·대체됨. */
// Chip은 hex를 받는다(confidenceChip과 같은 팔레트).
const STATUS: Record<EnrichmentCandidate["status"], { label: string; color: string }> = {
  pending: { label: "검수 대기", color: "#64748b" },
  approved: { label: "반영됨", color: "#0f9d63" },
  rejected: { label: "반려", color: "#d92d20" },
  superseded: { label: "대체됨", color: "#b57200" },
};

export function CandidateQueue({
  candidates,
  boothNames,
  slug,
  autoPassCount,
}: {
  candidates: EnrichmentCandidate[];
  boothNames: Record<string, string>;
  slug: string;
  /** 정책상 자동 통과 대상인 건수. 900부스에서 실제로 일을 줄이는 건 이 묶음이다. */
  autoPassCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  // 반려 사유. 사유 없는 반려는 "별로였다"는 한 비트만 남기고 다음 초안이
  // 똑같은 걸 또 만들어 온다.
  const [reason, setReason] = useState<Record<string, string>>({});
  const [note, setNote] = useState<Record<string, string>>({});
  // 검수자가 고친 값. 고치지 않으면 초안 그대로 나간다.
  const [edits, setEdits] = useState<Record<string, string>>({});

  async function act(c: EnrichmentCandidate, action: "approve" | "reject") {
    if (action === "reject" && !reason[c.id] && !note[c.id]?.trim()) {
      toast.error("반려 사유를 골라주세요 — 사유가 없으면 다음 초안이 같은 걸 또 만듭니다");
      return;
    }
    setBusy(c.id);
    try {
      const edited = edits[c.id];
      await api.post(`/api/admin/enrichment/candidates/${c.id}`, {
        action,
        ...(action === "approve" && edited
          ? { edited: JSON.parse(edited) }
          : {}),
        ...(action === "reject"
          ? { reasonCode: reason[c.id] || undefined, note: note[c.id] }
          : {}),
      });
      toast.success(action === "approve" ? "반영했습니다" : "반려했습니다");
      router.refresh();
    } catch (e) {
      toast.error(
        e instanceof SyntaxError
          ? "고친 내용이 JSON 형식이 아닙니다"
          : e instanceof ApiClientError
            ? e.message
            : "처리에 실패했습니다",
      );
    } finally {
      setBusy(null);
    }
  }

  async function bulkApprove() {
    setBusy("bulk");
    try {
      const res = await api.post<{ applied: number; note?: string }>(
        "/api/admin/enrichment/candidates/bulk",
        { exhibitionSlug: slug, expected: autoPassCount },
      );
      if (res.note) toast.error(res.note);
      else toast.success(`${res.applied}건 반영했습니다`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "일괄 반영 실패");
    } finally {
      setBusy(null);
    }
  }

  if (candidates.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        검수할 초안이 없습니다.
      </Card>
    );
  }

  return (
    <>
      {autoPassCount > 0 && (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-bold">자동 통과 대상 {autoPassCount}건</p>
            <p className="text-xs text-muted-foreground">
              신뢰도가 임계 이상이고 게이트가 결함을 못 찾은 것들입니다. 부스가 많은
              전시에서 전수 검수는 불가능하니, 위 승인률 표를 보고 한 번에 반영합니다.
            </p>
          </div>
          <Button onClick={() => void bulkApprove()} disabled={busy === "bulk"}>
            {busy === "bulk" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {autoPassCount}건 한 번에 반영
          </Button>
        </Card>
      )}

    <ul className="space-y-4">
      {candidates.map((c) => {
        const chip = confidenceChip(c.confidence);
        return (
          <Card key={c.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">
                {boothNames[c.boothId] ?? c.boothId}
              </span>
              {/* 몇 번째 초안인가. 2차 이상이면 지난 반려를 읽고 다시 쓴 것이라
                  검수자가 "같은 실수를 또 했는지"를 먼저 본다. */}
              <Chip color={(c.round ?? 1) > 1 ? "#b57200" : "#64748b"}>
                {c.round ?? 1}차
              </Chip>
              <Chip color={STATUS[c.status].color}>{STATUS[c.status].label}</Chip>
              <Chip color={chip.color}>
                신뢰도 {chip.label} · {Math.round(c.confidence * 100)}
              </Chip>
              <span className="ml-auto text-xs text-muted-foreground">
                {c.source}
              </span>
              {(() => {
                const p = reviewPolicy(c.confidence, c.issues);
                return (
                  <span
                    className="w-full text-xs text-muted-foreground"
                    title={p.reason}
                  >
                    {p.wouldAutoPass ? "✓ 자동 통과 대상" : p.reason}
                  </span>
                );
              })()}
            </div>

            {c.issues.length > 0 && (
              <ul className="space-y-1 rounded-lg bg-secondary p-3 text-xs">
                {c.issues.map((i, n) => (
                  <li key={n} className="flex gap-2">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    <span>{i.message}</span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="space-y-2 text-sm">
              {Object.entries(c.payload)
                // 빈 필드는 안 보여준다 — 초안기가 모르는 걸 비워둔 건 정상이고,
                // "타이밍 []"이 줄줄이 뜨면 정작 볼 것이 묻힌다.
                .filter(([, v]) => !isBlank(v))
                .map(([field, value]) => (
                  <div key={field}>
                    <dt className="text-xs font-medium text-muted-foreground">
                      {FIELD_LABEL[field] ?? field}
                    </dt>
                    <dd>{renderValue(field, value)}</dd>
                  </div>
                ))}
            </dl>

            {c.sources.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {c.sources.slice(0, 4).map((s, n) => (
                  <a
                    key={n}
                    href={s.uri}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-xs text-primary underline"
                  >
                    <ExternalLink className="size-3" />
                    {s.title ?? new URL(s.uri).hostname}
                  </a>
                ))}
              </div>
            )}

            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                고쳐서 반영하기 (JSON)
              </summary>
              <Textarea
                className="mt-2 font-mono text-xs"
                rows={8}
                defaultValue={JSON.stringify(c.payload, null, 2)}
                onChange={(e) =>
                  setEdits((prev) => ({ ...prev, [c.id]: e.target.value }))
                }
              />
            </details>

            <div className="space-y-2 rounded-lg bg-secondary p-3">
              <p className="text-xs font-medium">반려한다면, 왜?</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(REJECT_REASONS).map(([code, label]) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() =>
                      setReason((p) => ({
                        ...p,
                        [c.id]: p[c.id] === code ? "" : code,
                      }))
                    }
                    className={
                      reason[c.id] === code
                        ? "rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground"
                        : "rounded-full border border-border px-2.5 py-1 text-xs"
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Textarea
                rows={2}
                placeholder="구체적으로 무엇이 틀렸는지 (다음 초안 프롬프트에 그대로 들어갑니다)"
                className="text-sm"
                onChange={(e) =>
                  setNote((p) => ({ ...p, [c.id]: e.target.value }))
                }
              />
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => void act(c, "approve")}
                disabled={busy === c.id}
              >
                {busy === c.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                반영
              </Button>
              <Button
                variant="outline"
                onClick={() => void act(c, "reject")}
                disabled={busy === c.id}
              >
                <X className="size-4" />
                반려
              </Button>
            </div>
          </Card>
        );
      })}
    </ul>
    </>
  );
}
