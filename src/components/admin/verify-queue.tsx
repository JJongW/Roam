"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ExternalLink, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";

export interface VerifyRow {
  boothId: string;
  code: string;
  name: string;
  /** 운영 DB에 지금 들어 있는 글. */
  current: string;
  /** 사람이 브라우저로 확인한 글. */
  verified: string;
  sourceUrl?: string;
  /** 브랜드 본인이 참여를 밝힌 경우 — 참여 여부만큼은 100%다. */
  confirmed: boolean;
}

/** 두 글에서 서로에게 없는 조각을 뽑아 무엇이 다른지 눈에 띄게 한다.
 *  정교한 diff가 아니라 **어느 쪽에만 있는 말**을 보여주는 게 목적이다. */
function onlyIn(a: string, b: string): string[] {
  const words = (s: string) =>
    s.split(/[\s,.·()「」'"]+/).filter((w) => w.length >= 2);
  const B = new Set(words(b));
  return [...new Set(words(a).filter((w) => !B.has(w)))].slice(0, 14);
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
        summary: r.verified,
        sourceUrl: r.sourceUrl,
      });
      setDone((d) => ({ ...d, [r.boothId]: choice }));
      toast.success(choice === "verified" ? "확인한 값으로 교체했습니다" : "운영 값을 유지합니다");
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
        대조할 것이 없습니다 — 확인한 값과 운영 값이 모두 같거나, 아직 확인한 값이 없습니다.
      </Card>
    );
  }

  return (
    <ul className="space-y-4">
      {rows.map((r) => {
        const picked = done[r.boothId];
        return (
          <Card key={r.boothId} className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold">
                {r.code} {r.name}
              </span>
              {r.confirmed && (
                <Chip color="#0f9d63" icon={<ShieldCheck className="size-3.5" />}>
                  본인 확인
                </Chip>
              )}
              {picked && (
                <Chip color={picked === "verified" ? "#4f46e5" : "#64748b"}>
                  {picked === "verified" ? "교체함" : "운영 유지"}
                </Chip>
              )}
              {r.sourceUrl && (
                <a
                  href={r.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground underline"
                >
                  출처 <ExternalLink className="size-3" />
                </a>
              )}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <section className="rounded-xl border border-border p-3">
                <p className="mb-1 text-xs font-semibold text-muted-foreground">
                  운영에 있는 글 (자동 초안)
                </p>
                <p className="text-sm leading-relaxed">{r.current || "— 없음"}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  여기에만 있는 말: {onlyIn(r.current, r.verified).join(" · ") || "없음"}
                </p>
              </section>
              <section className="rounded-xl border border-primary/40 bg-primary/5 p-3">
                <p className="mb-1 text-xs font-semibold text-primary">
                  확인한 글 (사람이 직접 읽음)
                </p>
                <p className="text-sm leading-relaxed">{r.verified}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  여기에만 있는 말: {onlyIn(r.verified, r.current).join(" · ") || "없음"}
                </p>
              </section>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => choose(r, "verified")}
                disabled={busy === r.boothId}
              >
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
