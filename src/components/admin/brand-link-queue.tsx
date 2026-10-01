"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export interface BrandSide {
  exhibition: string;
  /** 그 행사에 표기된 명칭(설계 §3). */
  name: string;
  code: string;
  instagramUrl?: string;
  websiteUrl?: string;
  summary: string;
  image?: string;
}

export interface BrandLinkRow {
  id: string;
  reason: string;
  booth: BrandSide | null;
  targets: BrandSide[];
}

function Side({ s }: { s: BrandSide }) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {s.exhibition} · 부스 {s.code}
      </p>
      <div className="flex items-start gap-3">
        {s.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.image} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
        ) : null}
        <div className="min-w-0 space-y-1">
          <p className="font-bold">{s.name}</p>
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {s.instagramUrl && (
              <a href={s.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                <AtSign className="size-3" />
                {s.instagramUrl.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "")}
              </a>
            )}
            {s.websiteUrl && (
              <a href={s.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                <ExternalLink className="size-3" />
                {s.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
          </div>
        </div>
      </div>
      {s.summary && <p className="line-clamp-4 text-sm leading-relaxed text-foreground/80">{s.summary}</p>}
    </div>
  );
}

export function BrandLinkQueue({ rows }: { rows: BrandLinkRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    try {
      await api.post(`/api/admin/exhibitors/candidates/${id}`, { decision });
      toast.success(decision === "approved" ? "같은 브랜드로 이었어요" : "다른 브랜드로 두었어요");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장 실패");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">확인할 쌍이 없습니다.</p>;
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{rows.length}쌍</p>
      {rows.map((r) => (
        <Card key={r.id} className="space-y-4 p-5">
          <p className="text-xs font-bold text-muted-foreground">{r.reason}</p>
          <div className="grid gap-5 md:grid-cols-2">
            {r.booth ? <Side s={r.booth} /> : <p className="text-sm">부스를 찾을 수 없습니다</p>}
            <div className="space-y-4 md:border-l md:border-border md:pl-5">
              {r.targets.map((t, i) => (
                <Side key={i} s={t} />
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button disabled={busy === r.id} onClick={() => decide(r.id, "approved")}>
              {busy === r.id ? <Loader2 className="size-4 animate-spin" /> : "같은 브랜드"}
            </Button>
            <Button variant="outline" disabled={busy === r.id} onClick={() => decide(r.id, "rejected")}>
              다른 브랜드
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
