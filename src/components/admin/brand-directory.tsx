"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  filterDirectory,
  groupDirectory,
  optionCounts,
  type BrandSummary,
  type GroupBy,
} from "@/lib/brands/directory";
import type { FillLevel } from "@/lib/brands/profile";
import { CONTACT_STATUS_LABEL } from "@/lib/brands/contact";
import type { BrandContactStatus } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/ui/chip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/states";

const ALL = "all";
const PAGE = 60;

/** 연락 상태 색. 기존 토큰(primary, muted, destructive)만 쓴다. */
const STATUS_TONE: Record<BrandContactStatus, string> = {
  "not-sent": "bg-secondary text-muted-foreground",
  sent: "bg-primary/10 text-primary",
  read: "bg-primary/10 text-primary",
  replied: "bg-primary/15 text-primary",
  granted: "bg-primary text-primary-foreground",
  partial: "bg-primary/70 text-primary-foreground",
  declined: "bg-destructive/10 text-destructive",
  "no-reply": "bg-secondary text-foreground/70",
  withdrawn: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status, className }: { status: BrandContactStatus; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2 text-xs font-bold", STATUS_TONE[status], className)}>
      {CONTACT_STATUS_LABEL[status]}
    </span>
  );
}

const VIEW_LABEL: Record<"list" | GroupBy, string> = {
  list: "전체 목록",
  item: "품목별",
  texture: "결별",
  exhibition: "박람회별",
  fill: "채움별",
};

export function BrandDirectory({
  brands,
  unlinkedCount,
  exhibitions,
  contactStatus,
}: {
  brands: BrandSummary[];
  unlinkedCount: number;
  exhibitions: { id: string; name: string }[];
  contactStatus: Record<string, BrandContactStatus>;
}) {
  const [q, setQ] = useState("");
  const [exhibitionId, setExhibitionId] = useState(ALL);
  const [minApp, setMinApp] = useState(ALL);
  const [item, setItem] = useState(ALL);
  const [texture, setTexture] = useState(ALL);
  const [fill, setFill] = useState<FillLevel | typeof ALL>(ALL);
  const [review, setReview] = useState(ALL);
  const [view, setView] = useState<"list" | GroupBy>("list");
  const [shown, setShown] = useState(PAGE);

  const filtered = useMemo(
    () =>
      filterDirectory(brands, {
        q,
        exhibitionId: exhibitionId === ALL ? undefined : exhibitionId,
        minAppearances: minApp === ALL ? undefined : Number(minApp),
        item: item === ALL ? undefined : item,
        texture: texture === ALL ? undefined : texture,
        fill: fill === ALL ? undefined : fill,
        needsReview: review === "needs" || undefined,
      }),
    [brands, q, exhibitionId, minApp, item, texture, fill, review],
  );
  const itemOptions = useMemo(() => optionCounts(brands, (b) => b.items), [brands]);
  const textureOptions = useMemo(() => optionCounts(brands, (b) => b.textureTags), [brands]);
  const groups = useMemo(() => (view === "list" ? [] : groupDirectory(filtered, view)), [view, filtered]);

  const totals = useMemo(() => {
    let multi = 0, review = 0, full = 0;
    for (const b of filtered) {
      if (b.appearances.length > 1) multi++;
      if (b.fill.aiDraft + b.fill.stale > 0) review++;
      if (b.fillLevel === "full") full++;
    }
    return { multi, review, full };
  }, [filtered]);

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setShown(PAGE);
  };

  return (
    <div className="space-y-4">
      {unlinkedCount > 0 && <UnlinkedBanner count={unlinkedCount} />}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="이름, 작가명으로 찾기"
            value={q}
            onChange={(e) => reset(setQ)(e.target.value)}
            aria-label="이름으로 찾기"
          />
        </div>
        <FilterSelect label="박람회" value={exhibitionId} onChange={reset(setExhibitionId)} all="모든 박람회" className="w-64 max-w-full"
          options={exhibitions.map((e) => ({ value: e.id, label: e.name }))} />
        <FilterSelect label="출전 횟수" value={minApp} onChange={reset(setMinApp)} all="출전 횟수 전체"
          options={[{ value: "2", label: "2회 이상" }, { value: "3", label: "3회 이상" }]} />
        <FilterSelect label="품목" value={item} onChange={reset(setItem)} all="모든 품목"
          options={itemOptions.map((o) => ({ value: o.value, label: `${o.value} ${o.count}` }))} />
        <FilterSelect label="결" value={texture} onChange={reset(setTexture)} all="모든 결"
          options={textureOptions.map((o) => ({ value: o.value, label: `${o.value} ${o.count}` }))} />
        <FilterSelect label="채움" value={fill} onChange={(v) => reset(setFill)(v as FillLevel | typeof ALL)} all="채움 전체"
          options={[{ value: "full", label: "다 채움" }, { value: "partial", label: "일부 채움" }, { value: "empty", label: "확인된 칸 없음" }]} />
        <FilterSelect label="확인 필요" value={review} onChange={reset(setReview)} all="확인 필요 전체"
          options={[{ value: "needs", label: "AI 초안이나 다시 볼 칸 있음" }]} />
      </div>

      <Card className="flex flex-wrap items-center gap-x-5 gap-y-2 p-4">
        <p className="text-sm font-bold">브랜드 {filtered.length}곳</p>
        <p className="text-sm text-muted-foreground">
          2회 이상 출전 <b className="text-foreground">{totals.multi}</b>, 다 채움{" "}
          <b className="text-foreground">{totals.full}</b>, 확인 필요 <b className="text-foreground">{totals.review}</b>
        </p>
        {exhibitionId !== ALL && (
          <ExhibitionDraftButton
            key={exhibitionId}
            exhibitionId={exhibitionId}
            name={exhibitions.find((e) => e.id === exhibitionId)?.name ?? ""}
          />
        )}
      </Card>

      <Tabs value={view} onValueChange={(v) => reset(setView)(v as typeof view)}>
        <TabsList>
          {(Object.keys(VIEW_LABEL) as (keyof typeof VIEW_LABEL)[]).map((k) => (
            <TabsTrigger key={k} value={k}>
              {VIEW_LABEL[k]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {filtered.length === 0 ? (
        <EmptyState title="조건에 맞는 브랜드가 없어요" description="필터를 풀거나 다른 이름으로 찾아 보세요." bordered />
      ) : view === "list" ? (
        <>
          <BrandList rows={filtered.slice(0, shown)} contactStatus={contactStatus} />
          {filtered.length > shown && (
            <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
              더 보기 ({filtered.length - shown}곳 남음)
            </Button>
          )}
        </>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <GroupSection key={g.key} label={g.label} rows={g.rows} contactStatus={contactStatus} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  all,
  options,
  className = "w-40",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  all: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{all}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 박람회 하나의 브랜드에 초안 잡을 넣는다(첫 실행은 박람회 단위로, 2026-11-03 Ted 결정). */
function ExhibitionDraftButton({ exhibitionId, name }: { exhibitionId: string; name: string }) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    try {
      const r = await api.post<{ brands: number; complete: number; jobIds: string[] }>("/api/admin/brands/exhibition-drafts", {
        exhibitionId,
      });
      const msg =
        r.brands > 0
          ? `${r.brands}곳을 맡겼어요(잡 ${r.jobIds.length}개). 이미 다 채웠거나 기다리는 곳은 빼요`
          : "새로 맡길 브랜드가 없어요. 다 채웠거나 이미 기다리는 중이에요";
      setDone(msg);
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "맡기지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 md:ml-auto">
      {done && <span className="text-xs text-muted-foreground">{done}</span>}
      <Button size="sm" variant="outline" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : `${name} 브랜드 초안 만들기`}
      </Button>
    </div>
  );
}

/** 아직 어느 브랜드에도 안 이어진 출전 — 백필(identity.ts)로 정리한다. 애매한 짝은 연결 확인 목록으로. */
function UnlinkedBanner({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      const r = await api.post<{ summary: { newExhibitors: number; assignments: number; candidates: number } }>(
        "/api/admin/exhibitors/backfill",
        { apply: true },
      );
      toast.success(
        `출전 ${r.summary.assignments}건을 브랜드에 이었어요. 새 브랜드 ${r.summary.newExhibitors}곳, 확인할 짝 ${r.summary.candidates}건이에요`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "정리하지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="flex flex-col gap-3 border-primary/30 bg-primary/5 p-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-0.5">
        <p className="text-sm font-bold">아직 브랜드로 정리되지 않은 출전이 {count}건 있어요</p>
        <p className="text-sm text-muted-foreground">
          인스타나 웹 주소가 같은 곳은 바로 잇고, 이름만 같은 곳은 연결 확인 목록에 올려요.
        </p>
      </div>
      <Button onClick={run} disabled={busy} className="shrink-0">
        {busy ? <Loader2 className="animate-spin" /> : "출전 정리하기"}
      </Button>
    </Card>
  );
}

function GroupSection({
  label,
  rows,
  contactStatus,
}: {
  label: string;
  rows: BrandSummary[];
  contactStatus: Record<string, BrandContactStatus>;
}) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 8;
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold">
        {label} <span className="text-muted-foreground">{rows.length}</span>
      </h2>
      <BrandList rows={expanded ? rows : rows.slice(0, LIMIT)} contactStatus={contactStatus} />
      {rows.length > LIMIT && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "접기" : `${rows.length - LIMIT}곳 더 보기`}
        </Button>
      )}
    </section>
  );
}

function FillMeter({ b }: { b: BrandSummary }) {
  const pct = Math.round((b.fill.confirmed / b.fill.total) * 100);
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-secondary" aria-hidden>
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <span>
        확인 {b.fill.confirmed}/{b.fill.total}
      </span>
      {b.fill.aiDraft > 0 && <span className="font-semibold text-primary">AI 초안 {b.fill.aiDraft}</span>}
      {b.fill.stale > 0 && <span className="font-semibold text-destructive">다시 볼 것 {b.fill.stale}</span>}
    </div>
  );
}

function BrandList({ rows, contactStatus }: { rows: BrandSummary[]; contactStatus: Record<string, BrandContactStatus> }) {
  return (
    <Card className="divide-y divide-border p-0">
      {rows.map((b) => {
        const latest = b.appearances[0];
        const status = latest ? contactStatus[latest.boothId] ?? "not-sent" : null;
        return (
          <Link
            key={b.exhibitorId}
            href={`/admin/brands/${encodeURIComponent(b.exhibitorId)}`}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/40"
          >
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{b.name}</p>
                {b.artistName && b.artistName !== b.name && (
                  <span className="text-sm text-muted-foreground">{b.artistName}</span>
                )}
                {b.appearances.length > 1 && <Chip>{b.appearances.length}회 출전</Chip>}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {b.appearances.length === 0
                  ? "출전 없음"
                  : b.appearances.map((a) => `${a.exhibitionName}${a.code ? ` ${a.code}` : ""}`).join(", ")}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {b.items.slice(0, 5).map((i) => (
                  <Chip key={i} variant="outline">
                    {i}
                  </Chip>
                ))}
                {b.textureTags.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
              <FillMeter b={b} />
            </div>
            {status && <StatusBadge status={status} className="hidden shrink-0 md:inline-flex" />}
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </Link>
        );
      })}
    </Card>
  );
}
