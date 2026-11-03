"use client";

import { useState } from "react";
import { AtSign, ExternalLink, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import type { BrandAppearance, BrandSummary } from "@/lib/brands/directory";
import { BRAND_FIELDS, PARTICIPANT_FIELDS, summarizeFill } from "@/lib/brands/profile";
import { REACTION_LABEL, type ReactionCounts } from "@/lib/brands/reactions";
import type { BrandContact, BrandContactStatus, ProfileField } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/admin/brand-directory";
import { BrandContactSheet } from "@/components/admin/brand-contact-sheet";
import { FieldCard } from "@/components/admin/brands/field-card";

export interface Suggestion {
  field: string;
  value: unknown;
  sources: string[];
}

export function BrandProfile({
  brand,
  brandFields: initialBrandFields,
  participantFields: initialParticipantFields,
  suggestions,
  reactions,
  draftQueued,
  contactStatus: initialContactStatus,
}: {
  draftQueued: boolean;
  brand: BrandSummary;
  brandFields: ProfileField[];
  participantFields: ProfileField[];
  suggestions: Suggestion[];
  reactions: ReactionCounts;
  contactStatus: Record<string, BrandContactStatus>;
}) {
  const [brandFields, setBrandFields] = useState(initialBrandFields);
  const [participantFields, setParticipantFields] = useState(initialParticipantFields);
  const [contactStatus, setContactStatus] = useState(initialContactStatus);
  const [contactTarget, setContactTarget] = useState<{ brand: string; appearance: BrandAppearance } | null>(null);

  const fill = summarizeFill(brandFields);
  const artist = brandFields.find((f) => f.field === "artistName")?.value;

  const replace = (list: ProfileField[], ownerKey: "exhibitorId" | "participantId", owner: string, key: string, f: ProfileField | null) =>
    [...list.filter((x) => !(x[ownerKey] === owner && x.field === key)), ...(f ? [f] : [])];

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-extrabold">{brand.name}</h2>
          {typeof artist === "string" && artist !== brand.name && <span className="text-muted-foreground">{artist}</span>}
          <Chip>{brand.appearances.length}회 출전</Chip>
          <DraftButton exhibitorId={brand.exhibitorId} initiallyQueued={draftQueued} />
        </div>
        <p className="text-sm text-muted-foreground">
          확인된 칸 {fill.confirmed}/{fill.total}
          {fill.aiDraft > 0 && `, AI 초안 ${fill.aiDraft}`}
          {fill.stale > 0 && `, 다시 볼 것 ${fill.stale}`}
          {fill.empty > 0 && `, 빈 칸 ${fill.empty}`}. 이름은 공식 목록에서 가져온 값이에요.
        </p>
      </header>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">프로필</TabsTrigger>
          <TabsTrigger value="appearances">출전 {brand.appearances.length}</TabsTrigger>
          <TabsTrigger value="contact">연락</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-4 pt-3">
          <Card className="divide-y divide-border p-0">
            {BRAND_FIELDS.map((def) => (
              <FieldCard
                key={def.key}
                def={def}
                subject={{ exhibitorId: brand.exhibitorId }}
                field={brandFields.find((f) => f.field === def.key)}
                suggestion={suggestions.find((s) => s.field === def.key)}
                onSaved={(k, f) => setBrandFields((l) => replace(l, "exhibitorId", brand.exhibitorId, k, f))}
              />
            ))}
          </Card>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="space-y-2 p-4">
              <p className="font-semibold">
                출전 이력 <span className="text-xs font-normal text-muted-foreground">출전 기록에서 자동</span>
              </p>
              <ul className="space-y-1 text-sm">
                {brand.appearances.map((a) => (
                  <li key={a.boothId}>
                    {a.exhibitionName}
                    <span className="text-muted-foreground">{a.code ? `, 부스 ${a.code}` : ""}{a.name !== brand.name ? `, 표기 ${a.name}` : ""}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="space-y-2 p-4">
              <p className="font-semibold">
                방문객 반응 <span className="text-xs font-normal text-muted-foreground">Roam 앱 기록, 내부에서만 봐요</span>
              </p>
              {reactions.people === 0 ? (
                <p className="text-sm text-muted-foreground">아직 남긴 반응이 없어요.</p>
              ) : (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {(Object.keys(REACTION_LABEL) as (keyof typeof REACTION_LABEL)[]).map((k) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-muted-foreground">{REACTION_LABEL[k]}</dt>
                      <dd className="tabular-nums">{reactions[k]}</dd>
                    </div>
                  ))}
                  <div className="col-span-2 text-xs text-muted-foreground">{reactions.people}명이 남겼어요. 다녀온 것과 좋아한 것은 따로 세요.</div>
                </dl>
              )}
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="appearances" className="space-y-4 pt-3">
          {brand.appearances.length === 0 && <p className="text-sm text-muted-foreground">이 브랜드에 이어진 출전이 없어요.</p>}
          {brand.appearances.map((a) => (
            <Card key={a.boothId} className="p-0">
              <AppearanceHeader a={a} />
              {a.participantId ? (
                <div className="divide-y divide-border border-t border-border">
                  {PARTICIPANT_FIELDS.map((def) => (
                    <FieldCard
                      key={def.key}
                      def={def}
                      subject={{ participantId: a.participantId! }}
                      field={participantFields.find((f) => f.participantId === a.participantId && f.field === def.key)}
                      onSaved={(k, f) => setParticipantFields((l) => replace(l, "participantId", a.participantId!, k, f))}
                    />
                  ))}
                </div>
              ) : (
                <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">참가 기록이 없어 출전 칸을 쓸 수 없어요.</p>
              )}
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="contact" className="space-y-3 pt-3">
          <p className="text-sm text-muted-foreground">허락은 박람회마다 따로 받아요. 출전마다 연락 기록이 따로 있어요.</p>
          <Card className="divide-y divide-border p-0">
            {brand.appearances.map((a) => (
              <div key={a.boothId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{a.exhibitionName}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.code ? `부스 ${a.code}, ` : ""}
                    {a.name}
                  </p>
                </div>
                <StatusBadge status={contactStatus[a.boothId] ?? "not-sent"} />
                <Button size="sm" variant="outline" onClick={() => setContactTarget({ brand: brand.name, appearance: a })}>
                  연락 기록
                </Button>
              </div>
            ))}
          </Card>
        </TabsContent>
      </Tabs>

      <BrandContactSheet
        target={contactTarget}
        onClose={() => setContactTarget(null)}
        onSaved={(c: BrandContact) => setContactStatus((m) => ({ ...m, [c.boothId]: c.status }))}
      />
    </div>
  );
}

/** 초안 잡을 넣는다. 실행은 워커가 하고, 끝나면 AI 초안 칸이 생긴다. */
function DraftButton({ exhibitorId, initiallyQueued }: { exhibitorId: string; initiallyQueued: boolean }) {
  const [queued, setQueued] = useState(initiallyQueued);
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try {
      await api.post(`/api/admin/brands/${encodeURIComponent(exhibitorId)}/draft`);
      setQueued(true);
      toast.success("초안을 만들도록 맡겼어요. 워커가 끝내면 AI 초안 칸이 생겨요");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "맡기지 못했어요");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="outline" className="ml-auto" onClick={run} disabled={busy || queued}>
      {busy ? <Loader2 className="animate-spin" /> : queued ? "초안 기다리는 중" : "초안 만들기"}
    </Button>
  );
}

function AppearanceHeader({ a }: { a: BrandAppearance }) {
  const [moving, setMoving] = useState(false);
  // 부스 편집 화면은 고른 박람회(쿠키) 하나만 그린다 — 그 회차로 바꾼 뒤 연다.
  async function openEditor() {
    setMoving(true);
    try {
      await api.post("/api/admin/exhibition-selection", { exhibitionId: a.exhibitionId });
      window.location.href = `/admin/booths?edit=${encodeURIComponent(a.boothId)}`;
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "박람회를 바꾸지 못했어요");
      setMoving(false);
    }
  }
  const ig = a.instagramUrl?.replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/$/, "");
  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-semibold">{a.exhibitionName}</p>
        <p className="text-sm text-muted-foreground">
          부스명 {a.name}, {a.code ? `부스 번호 ${a.code}` : "부스 번호 없음"}
          {a.categoryName ? `, ${a.categoryName}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {ig && (
            <a href={a.instagramUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
              <AtSign className="size-3" />
              {ig}
            </a>
          )}
          {a.websiteUrl && (
            <a href={a.websiteUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline">
              <ExternalLink className="size-3" />
              웹
            </a>
          )}
          <span>{a.enrichment === "full" ? "부스 저작 채움" : a.enrichment === "partial" ? `부스 저작 빈 칸 ${a.enrichmentMissing}` : "부스 저작 없음"}</span>
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={openEditor} disabled={moving} aria-label="부스 편집">
        <Pencil />
        부스 편집
      </Button>
    </div>
  );
}
