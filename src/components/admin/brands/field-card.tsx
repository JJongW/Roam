"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  FIELD_STATUS_LABEL,
  ITEM_OPTIONS,
  LINK_KIND_LABEL,
  TEXTURE_OPTIONS,
  type FieldDef,
} from "@/lib/brands/profile";
import type { ProfileField, ProfileFieldStatus, ProfileSubject } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const STATUS_TONE: Record<ProfileFieldStatus, string> = {
  collected: "bg-secondary text-foreground",
  ai_draft: "bg-primary/10 text-primary",
  reviewed: "bg-primary text-primary-foreground",
  artist_confirmed: "bg-primary text-primary-foreground ring-2 ring-primary/30",
  stale: "bg-destructive/10 text-destructive",
};

export function FieldStatusBadge({ status }: { status: ProfileFieldStatus | null }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-bold",
        status ? STATUS_TONE[status] : "border border-dashed border-border text-muted-foreground",
      )}
    >
      {status ? FIELD_STATUS_LABEL[status] : "비어 있음"}
    </span>
  );
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

type Range = { min: number; max: number; currency: "KRW" };
type Texture = { tags: string[]; note?: string };
type Why = { summary: string; original?: string };
type Photo = { path: string; scope: string };
type LinkV = { kind: keyof typeof LINK_KIND_LABEL; url: string };
type Prose = { original: string; display?: string; gate?: { ok: boolean; issues: string[] } };

function linkKind(url: string): LinkV["kind"] {
  const h = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (h === "instagram.com") return "instagram";
  if (h === "x.com" || h === "twitter.com") return "x";
  if (/smartstore\.naver\.com|marpple|witchform|idus|29cm|shop/.test(h)) return "store";
  return h ? "site" : "other";
}

/** 칸 값을 화면용으로. */
export function FieldValue({ def, value }: { def: FieldDef; value: unknown }) {
  switch (def.kind) {
    case "list":
    case "items":
      return (
        <div className="flex flex-wrap gap-1.5">
          {(value as string[]).map((v) => (
            <span key={v} className="rounded-full border border-border px-2 py-0.5 text-sm">
              {v}
            </span>
          ))}
        </div>
      );
    case "links":
      return (
        <ul className="space-y-0.5 text-sm">
          {(value as LinkV[]).map((l) => (
            <li key={l.url} className="truncate">
              <span className="text-muted-foreground">{LINK_KIND_LABEL[l.kind]} </span>
              <a href={l.url} target="_blank" rel="noreferrer" className="underline">
                {l.url.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            </li>
          ))}
        </ul>
      );
    case "range": {
      const r = value as Range;
      return <p className="text-sm">{`${r.min.toLocaleString()}원에서 ${r.max.toLocaleString()}원`}</p>;
    }
    case "texture": {
      const t = value as Texture;
      return (
        <div className="space-y-1">
          <div className="flex flex-wrap gap-1.5">
            {t.tags.map((x) => (
              <span key={x} className="rounded-full bg-primary/10 px-2 py-0.5 text-sm text-primary">
                {x}
              </span>
            ))}
          </div>
          {t.note && <p className="text-sm">{t.note}</p>}
        </div>
      );
    }
    case "why": {
      const w = value as Why;
      return (
        <div className="space-y-1 text-sm">
          <p>{w.summary}</p>
          {w.original && <p className="whitespace-pre-wrap text-muted-foreground">원문: {w.original}</p>}
        </div>
      );
    }
    case "prose": {
      const p = value as Prose;
      return (
        <div className="space-y-2 text-sm">
          {p.display ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">앱에 보일 문장(말투만 고침)</p>
              <p>{p.display}</p>
              {p.gate?.ok && <p className="text-xs font-semibold text-primary">게이트 통과: 숫자, 이름, 품목이 그대로예요</p>}
              {p.gate && !p.gate.ok && (
                <div role="alert" className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <p className="font-bold">말투 게이트에 걸렸어요. 원문과 내용이 달라졌을 수 있어요</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {p.gate.issues.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <p className="text-destructive/80">
                    사람이 저장한 문장은 막지 않아요. 에디터 확인 상태라 앱에 보이니 한 번 더 봐 주세요.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">아직 말투를 고친 문장이 없어서 앱에는 안 보여요.</p>
          )}
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">공식 소개 원문</summary>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{p.original}</p>
          </details>
        </div>
      );
    }
    case "photos":
      return (
        <ul className="space-y-0.5 text-sm">
          {(value as Photo[]).map((p) => (
            <li key={p.path} className="break-all">
              {p.path} <span className="text-muted-foreground">({p.scope})</span>
            </li>
          ))}
        </ul>
      );
    default:
      return <p className="break-all text-sm">{String(value)}</p>;
  }
}

const lines = (s: string) =>
  s
    .split(/\n/)
    .map((x) => x.trim())
    .filter(Boolean);

/** 편집 폼 상태 ↔ 값. 칸 모양마다 한 가지 입력. */
function toDraft(def: FieldDef, v: unknown): Record<string, string | string[]> {
  if (v == null) return { text: "", tags: [], note: "", min: "", max: "", summary: "", original: "" };
  switch (def.kind) {
    case "list":
      return { text: (v as string[]).join("\n") };
    case "items":
      return { tags: v as string[] };
    case "links":
      return { text: (v as LinkV[]).map((l) => l.url).join("\n") };
    case "range":
      return { min: String((v as Range).min), max: String((v as Range).max) };
    case "texture":
      return { tags: (v as Texture).tags, note: (v as Texture).note ?? "" };
    case "why":
      return { summary: (v as Why).summary, original: (v as Why).original ?? "" };
    case "photos":
      return { text: (v as Photo[]).map((p) => `${p.path} | ${p.scope}`).join("\n") };
    case "prose":
      return { original: (v as Prose).original, summary: (v as Prose).display ?? "" };
    default:
      return { text: String(v) };
  }
}

function fromDraft(def: FieldDef, d: Record<string, string | string[]>): unknown {
  const s = (k: string) => String(d[k] ?? "");
  switch (def.kind) {
    case "list":
      return lines(s("text"));
    case "items":
      return d.tags as string[];
    case "links":
      return lines(s("text")).map((url) => ({ kind: linkKind(url), url }));
    case "range":
      return { min: Number(s("min")), max: Number(s("max")), currency: "KRW" };
    case "texture":
      return { tags: d.tags as string[], ...(s("note").trim() ? { note: s("note").trim() } : {}) };
    case "why":
      return { summary: s("summary"), ...(s("original").trim() ? { original: s("original") } : {}) };
    case "photos":
      return lines(s("text")).map((l) => {
        const [path, ...rest] = l.split("|");
        return { path: path.trim(), scope: rest.join("|").trim() };
      });
    case "prose":
      return { original: s("original"), ...(s("summary").trim() ? { display: s("summary").trim() } : {}) };
    default:
      return s("text").trim();
  }
}

export function FieldCard({
  def,
  subject,
  field,
  suggestion,
  onSaved,
}: {
  def: FieldDef;
  subject: ProfileSubject;
  field: ProfileField | undefined;
  suggestion?: { value: unknown; sources: string[] };
  onSaved: (key: string, f: ProfileField | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string | string[]>>(() => toDraft(def, field?.value));
  const [sources, setSources] = useState((field?.sources ?? []).join("\n"));
  const [artist, setArtist] = useState(field?.status === "artist_confirmed");
  const [busy, setBusy] = useState(false);

  async function send(body: { value: unknown; sources?: string[]; status?: string }, msg: string) {
    setBusy(true);
    try {
      const r = await api.patch<{ field: ProfileField | null }>("/api/admin/brands/fields", {
        subject,
        field: def.key,
        ...body,
      });
      onSaved(def.key, r.field);
      setEditing(false);
      const gate = (r.field?.value as { gate?: { ok: boolean; issues: string[] } } | undefined)?.gate;
      if (gate && !gate.ok) toast.warning(`저장했어요. 말투 게이트에 걸린 곳이 ${gate.issues.length}개 있어요`);
      else toast.success(msg);
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장하지 못했어요");
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    setDraft(toDraft(def, field?.value));
    setSources((field?.sources ?? []).join("\n"));
    setArtist(field?.status === "artist_confirmed");
    setEditing(true);
  }

  const toggleTag = (t: string) =>
    setDraft((d) => {
      const tags = (d.tags as string[]) ?? [];
      return { ...d, tags: tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t] };
    });

  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{def.label}</p>
        <FieldStatusBadge status={field?.status ?? null} />
        {!editing && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={startEdit} aria-label={`${def.label} 고치기`}>
            <Pencil />
            고치기
          </Button>
        )}
      </div>

      {!editing && (
        <>
          {field ? (
            <FieldValue def={def} value={field.value} />
          ) : (
            <p className="text-sm text-muted-foreground">{def.fill}</p>
          )}
          {field && (
            <p className="text-xs text-muted-foreground">
              {fmt(field.verifiedAt)}
              {field.actor ? `, ${field.actor}` : ""}
              {field.sources.length > 0 && (
                <>
                  {", 출처 "}
                  {field.sources.map((s, i) => (
                    <span key={s}>
                      {i > 0 && ", "}
                      {/^https?:/.test(s) ? (
                        <a href={s} target="_blank" rel="noreferrer" className="underline">
                          {s.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
                        </a>
                      ) : (
                        s
                      )}
                    </span>
                  ))}
                </>
              )}
            </p>
          )}
          {!field && suggestion && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-secondary/50 px-3 py-2">
              <span className="text-xs text-muted-foreground">부스 정보에 있는 값</span>
              <FieldValue def={def} value={suggestion.value} />
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                disabled={busy}
                onClick={() => send({ value: suggestion.value, sources: suggestion.sources, status: "collected" }, "가져왔어요")}
              >
                가져오기
              </Button>
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          {(def.kind === "items" || def.kind === "texture") && (
            <div className="flex flex-wrap gap-1.5">
              {(def.kind === "items" ? ITEM_OPTIONS : TEXTURE_OPTIONS).map((t) => {
                const on = ((draft.tags as string[]) ?? []).includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(t)}
                    className={cn(
                      "min-h-8 cursor-pointer rounded-full border px-2.5 text-xs font-semibold",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                    )}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          )}
          {def.kind === "texture" && (
            <Input placeholder="결을 한 줄로(선택)" value={String(draft.note ?? "")} onChange={(e) => setDraft({ ...draft, note: e.target.value })} aria-label="결 한 줄" />
          )}
          {(def.kind === "text60" || def.kind === "text200" || def.kind === "url") && (
            <Input value={String(draft.text ?? "")} onChange={(e) => setDraft({ ...draft, text: e.target.value })} aria-label={def.label} />
          )}
          {(def.kind === "list" || def.kind === "links" || def.kind === "photos") && (
            <Textarea
              rows={3}
              value={String(draft.text ?? "")}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
              aria-label={def.label}
              placeholder={
                def.kind === "links" ? "한 줄에 주소 하나" : def.kind === "photos" ? "경로 | 허락 범위 (한 줄에 하나)" : "한 줄에 하나"
              }
            />
          )}
          {def.kind === "range" && (
            <div className="flex items-center gap-2">
              <Input type="number" min={0} className="w-32" value={String(draft.min ?? "")} onChange={(e) => setDraft({ ...draft, min: e.target.value })} aria-label="최소 가격" />
              <span className="text-sm text-muted-foreground">원에서</span>
              <Input type="number" min={0} className="w-32" value={String(draft.max ?? "")} onChange={(e) => setDraft({ ...draft, max: e.target.value })} aria-label="최대 가격" />
              <span className="text-sm text-muted-foreground">원</span>
            </div>
          )}
          {def.kind === "prose" && (
            <>
              <Textarea
                rows={4}
                placeholder="공식 소개 원문"
                value={String(draft.original ?? "")}
                onChange={(e) => setDraft({ ...draft, original: e.target.value })}
                readOnly={!!field}
                aria-label="공식 소개 원문"
              />
              <Textarea
                rows={4}
                placeholder="앱에 보일 문장(내용은 그대로, 말투만 해요체로)"
                value={String(draft.summary ?? "")}
                onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                aria-label="앱에 보일 문장"
              />
              <p className="text-xs text-muted-foreground">원문은 고치지 않아요. 저장하면 말투 게이트를 다시 돌려 결과를 같이 남겨요.</p>
            </>
          )}
          {def.kind === "why" && (
            <>
              <Textarea rows={3} placeholder="작가 말 요약" value={String(draft.summary ?? "")} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} aria-label="작가 말 요약" />
              <Textarea rows={3} placeholder="받은 답 원문(선택)" value={String(draft.original ?? "")} onChange={(e) => setDraft({ ...draft, original: e.target.value })} aria-label="원문" />
            </>
          )}
          <Textarea
            rows={2}
            placeholder={def.artistOnly ? "출처(작가 답이 있는 연락 기록이나 링크, 한 줄에 하나)" : "출처 주소(한 줄에 하나)"}
            value={sources}
            onChange={(e) => setSources(e.target.value)}
            aria-label="출처"
          />
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={artist} onCheckedChange={setArtist} aria-label="작가에게 확인받았어요" />
            작가에게 확인받았어요
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                send(
                  { value: fromDraft(def, draft), sources: lines(sources), status: artist ? "artist_confirmed" : "reviewed" },
                  "저장했어요",
                )
              }
            >
              {busy ? <Loader2 className="animate-spin" /> : "저장"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={busy}>
              취소
            </Button>
            {field && (
              <Button size="sm" variant="ghost" className="ml-auto text-destructive" disabled={busy} onClick={() => send({ value: null }, "칸을 비웠어요")}>
                칸 비우기
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            저장하면 에디터 확인으로 바뀌어요. 작가에게 확인받았다고 켜면 작가 확인으로 남아요.
          </p>
        </div>
      )}
    </div>
  );
}
