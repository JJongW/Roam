"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ExternalLink, ShieldCheck, AtSign } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import type { VerifiedFact } from "@/lib/verified";

/** 부스 하나의 저작 필드 전부. 대조는 요약만이 아니라 **초안 전체**로 한다. */
export interface DraftFields {
  summary?: string;
  roamInterpretation?: string;
  valueTags?: { slug: string; strength: number }[];
  recommendationReasons?: Record<string, string>;
  thingsToDo?: string[];
  timing?: string[];
  memoryHooks?: string[];
  sourceUrl?: string;
}

export interface VerifyRow {
  boothId: string;
  code: string;
  name: string;
  /** 운영 DB에 지금 들어 있는 초안 전체. */
  current: DraftFields;
  /** 사람이 브라우저로 직접 확인한 것. */
  verified: VerifiedFact;
}

const LABEL: Record<keyof DraftFields, string> = {
  summary: "요약",
  roamInterpretation: "로미 한 줄",
  valueTags: "가치 태그",
  recommendationReasons: "가치별 근거",
  thingsToDo: "할 것",
  timing: "타이밍",
  memoryHooks: "기억 단서",
  sourceUrl: "출처",
};

function render(v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v))
    return v
      .map((x) =>
        typeof x === "object" && x && "slug" in x
          ? `${(x as { slug: string }).slug} ${(x as { strength: number }).strength}`
          : String(x),
      )
      .join(" · ");
  if (typeof v === "object")
    return Object.entries(v as Record<string, string>)
      .map(([k, t]) => `${k}: ${t}`)
      .join("\n");
  return String(v);
}

export function VerifyQueue({ rows }: { rows: VerifyRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "verified" | "keep">>({});

  async function choose(r: VerifyRow, choice: "verified" | "keep") {
    setBusy(r.boothId);
    try {
      await api.post("/api/admin/verify", {
        boothId: r.boothId,
        choice,
        summary: r.verified.summary,
        sourceUrl: r.verified.sourceUrl ?? r.verified.instagram?.url,
      });
      setDone((d) => ({ ...d, [r.boothId]: choice }));
      toast.success(
        choice === "verified" ? "확인한 값으로 교체했습니다" : "운영 값을 유지합니다",
      );
      if (choice === "verified") router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.message : "실패했습니다");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        대조할 것이 없습니다.
      </Card>
    );
  }

  const FIELDS = Object.keys(LABEL) as (keyof DraftFields)[];

  return (
    <ul className="space-y-6">
      {rows.map((r) => {
        const picked = done[r.boothId];
        const ig = r.verified.instagram;
        return (
          <Card key={r.boothId} className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">
                {r.code} {r.name}
              </span>
              {r.verified.confirmed && (
                <Chip color="#0f9d63" icon={<ShieldCheck className="size-3.5" />}>
                  본인 확인
                </Chip>
              )}
              {picked && (
                <Chip color={picked === "verified" ? "#4f46e5" : "#64748b"}>
                  {picked === "verified" ? "교체함" : "운영 유지"}
                </Chip>
              )}
            </div>

            {/* 브랜드가 자기 사이트에 걸어둔 대표 이미지. */}
            {r.verified.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={r.verified.image}
                alt={`${r.name} 대표 이미지`}
                className="h-40 w-full rounded-xl object-cover"
              />
            )}

            {/* 근거 원문 — 요약만 보고 판단하지 않도록 읽은 것을 그대로 둔다. */}
            {ig && (
              <section className="rounded-xl border border-border bg-secondary/40 p-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <a
                    href={ig.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold underline"
                  >
                    <AtSign className="size-3.5" />@{ig.handle}
                  </a>
                  {ig.website && (
                    <a
                      href={ig.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline"
                    >
                      웹사이트 <ExternalLink className="size-3" />
                    </a>
                  )}
                </div>
                {ig.header && (
                  <p className="mt-2 text-xs text-muted-foreground">{ig.header}</p>
                )}
                {ig.posts?.length ? (
                  <ul className="mt-2 space-y-1">
                    {ig.posts.map((p, i) => (
                      <li key={i} className="text-xs leading-relaxed">
                        <span className="text-muted-foreground">게시물 — </span>
                        {p}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            )}

            {/* 전체 필드 대조. 값이 양쪽 다 없는 줄은 안 그린다. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="w-24 pb-2">필드</th>
                    <th className="pb-2">운영에 있는 초안</th>
                    <th className="pb-2 text-primary">확인한 값</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map((f) => {
                    const cur = render(r.current[f]);
                    const ver =
                      f === "summary"
                        ? r.verified.summary
                        : f === "sourceUrl"
                          ? (r.verified.sourceUrl ?? ig?.url ?? "")
                          : "";
                    if (!cur && !ver) return null;
                    const differs = cur.trim() !== ver.trim();
                    return (
                      <tr key={f} className="border-t border-border align-top">
                        <td className="py-2 text-xs font-medium text-muted-foreground">
                          {LABEL[f]}
                        </td>
                        <td className="py-2 pr-3 whitespace-pre-wrap">{cur || "—"}</td>
                        <td
                          className={
                            "py-2 whitespace-pre-wrap " +
                            (ver && differs ? "bg-primary/5 font-medium" : "")
                          }
                        >
                          {ver || <span className="text-muted-foreground">— 확인 안 함</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-muted-foreground">
              교체하면 요약과 출처만 바뀝니다 — 나머지 필드는 운영 값을 그대로 둡니다.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => choose(r, "verified")} disabled={busy === r.boothId}>
                {busy === r.boothId ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                확인한 값으로 교체
              </Button>
              <Button
                variant="secondary"
                onClick={() => choose(r, "keep")}
                disabled={busy === r.boothId}
              >
                운영 값 유지
              </Button>
            </div>
          </Card>
        );
      })}
    </ul>
  );
}
