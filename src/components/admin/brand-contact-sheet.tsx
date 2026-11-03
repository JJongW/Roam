"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { BrandAppearance } from "@/lib/brands/directory";
import {
  ALLOWED_USE_LABEL,
  CONTACT_CHANNEL_LABEL,
  CONTACT_CHECKLIST,
  CONTACT_STATUS_LABEL,
  LOG_DIRECTION_LABEL,
  LOG_KIND_LABEL,
} from "@/lib/brands/contact";
import {
  BRAND_CONTACT_CHANNELS,
  BRAND_CONTACT_LOG_DIRECTIONS,
  BRAND_CONTACT_LOG_KINDS,
  BRAND_CONTACT_STATUSES,
  type BrandContact,
  type BrandContactChannel,
  type BrandContactLog,
  type BrandContactLogDirection,
  type BrandContactLogKind,
  type BrandContactStatus,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const NONE = "none";

type Draft = Pick<
  BrandContact,
  | "status"
  | "channel"
  | "handle"
  | "sentAt"
  | "reply"
  | "allowedUse"
  | "photoSource"
  | "textSource"
  | "notes"
>;

function toDraft(c: BrandContact): Draft {
  return {
    status: c.status,
    channel: c.channel,
    handle: c.handle,
    sentAt: c.sentAt,
    reply: c.reply,
    allowedUse: c.allowedUse,
    photoSource: c.photoSource,
    textSource: c.textSource,
    notes: c.notes,
  };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD(로컬)

export function BrandContactSheet({
  target,
  onClose,
  onSaved,
}: {
  target: { brand: string; appearance: BrandAppearance } | null;
  onClose: () => void;
  onSaved: (c: BrandContact) => void;
}) {
  const a = target?.appearance;
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{target?.brand}</SheetTitle>
          <SheetDescription>
            {a ? `${a.exhibitionName}${a.code ? `, 부스 ${a.code}` : ""}` : ""}
          </SheetDescription>
        </SheetHeader>
        {/* key로 부스가 바뀔 때마다 새로 그린다 — 이전 부스의 입력이 남지 않게. */}
        {a && (
          <ContactEditor
            key={a.boothId}
            boothId={a.boothId}
            onSaved={onSaved}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function ContactEditor({
  boothId,
  onSaved,
}: {
  boothId: string;
  onSaved: (c: BrandContact) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState<BrandContact | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [logs, setLogs] = useState<BrandContactLog[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get<{ contact: BrandContact; logs: BrandContactLog[] }>(
        `/api/admin/brands/contacts/${encodeURIComponent(boothId)}`,
      )
      .then((d) => {
        if (!alive) return;
        setContact(d.contact);
        setDraft(toDraft(d.contact));
        setChecks(
          Object.fromEntries(
            CONTACT_CHECKLIST.map((c) => [c.key, !!d.contact.checklist[c.key]]),
          ),
        );
        setLogs(d.logs);
      })
      .catch((e) =>
        toast.error(
          e instanceof ApiClientError ? e.error.message : "불러오지 못했어요",
        ),
      )
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [boothId]);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  }

  function toggleCheck(key: string, on: boolean) {
    setChecks((c) => ({ ...c, [key]: on }));
    // "DM 보냄"을 켰는데 아직 미연락이면 상태와 보낸 날짜도 같이 채운다(저장 전이라 고칠 수 있다).
    if (key === "dm-sent" && on && draft?.status === "not-sent") {
      setDraft((d) =>
        d ? { ...d, status: "sent", sentAt: d.sentAt ?? today() } : d,
      );
    }
  }

  async function save() {
    if (!boothId || !draft || !contact) return;
    setSaving(true);
    try {
      const checklist = Object.fromEntries(
        Object.entries(checks).filter(
          ([k, on]) => on !== !!contact.checklist[k],
        ),
      );
      const { contact: saved } = await api.patch<{ contact: BrandContact }>(
        `/api/admin/brands/contacts/${encodeURIComponent(boothId)}`,
        { ...draft, handle: draft.handle ?? null, checklist },
      );
      setContact(saved);
      setDraft(toDraft(saved));
      onSaved(saved);
      toast.success("저장했어요");
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.error.message : "저장하지 못했어요",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft || !contact)
    return (
      <div className="flex justify-center py-10">
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <p className="text-sm text-muted-foreground">
            불러오지 못했어요. 닫고 다시 열어 주세요.
          </p>
        )}
      </div>
    );
  return (
    <div className="grid gap-6 px-5 pt-3 pb-8 md:grid-cols-2">
      <section className="space-y-3">
        <p className="text-xs font-bold text-muted-foreground">연락 상태</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="상태">
            <Select
              value={draft.status}
              onValueChange={(v) => set("status", v as BrandContactStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BRAND_CONTACT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {CONTACT_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="보낸 날짜">
            <Input
              type="date"
              value={draft.sentAt ?? ""}
              onChange={(e) => set("sentAt", e.target.value || null)}
            />
          </Field>
          <Field label="채널">
            <Select
              value={draft.channel ?? NONE}
              onValueChange={(v) =>
                set("channel", v === NONE ? null : (v as BrandContactChannel))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>정하지 않음</SelectItem>
                {BRAND_CONTACT_CHANNELS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CONTACT_CHANNEL_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="계정이나 주소">
            <Input
              placeholder="@계정"
              value={draft.handle ?? ""}
              onChange={(e) => set("handle", e.target.value || null)}
            />
          </Field>
        </div>
        <Field
          label="답 요약"
          description="한 줄로 적어요. 받은 말 그대로가 아니어도 돼요."
        >
          <Input
            value={draft.reply ?? ""}
            onChange={(e) => set("reply", e.target.value || null)}
          />
        </Field>
        <Field label="허락 범위">
          <div className="flex flex-wrap gap-1.5">
            {[
              ...new Set([
                ...Object.keys(ALLOWED_USE_LABEL),
                ...draft.allowedUse,
              ]),
            ].map((tok) => {
              const on = draft.allowedUse.includes(tok);
              return (
                <button
                  key={tok}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      "allowedUse",
                      on
                        ? draft.allowedUse.filter((t) => t !== tok)
                        : [...draft.allowedUse, tok],
                    )
                  }
                  className={cn(
                    "min-h-8 cursor-pointer rounded-full border px-2.5 text-xs font-semibold",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card",
                  )}
                >
                  {ALLOWED_USE_LABEL[tok] ?? tok}
                </button>
              );
            })}
          </div>
        </Field>
        <Field
          label="사진 위치"
          description="받은 사진이 있는 경로나 링크예요. 파일은 여기에 올리지 않아요."
        >
          <Input
            value={draft.photoSource ?? ""}
            onChange={(e) => set("photoSource", e.target.value || null)}
          />
        </Field>
        <Field
          label="글 위치"
          description="받은 작품 소개가 있는 경로나 링크예요."
        >
          <Input
            value={draft.textSource ?? ""}
            onChange={(e) => set("textSource", e.target.value || null)}
          />
        </Field>
        <Field label="메모">
          <Textarea
            rows={3}
            value={draft.notes ?? ""}
            onChange={(e) => set("notes", e.target.value || null)}
          />
        </Field>

        <p className="pt-2 text-xs font-bold text-muted-foreground">
          체크리스트
        </p>
        <ul className="space-y-1">
          {CONTACT_CHECKLIST.map((c) => {
            const doneAt = contact.checklist[c.key];
            return (
              <li
                key={c.key}
                className="flex items-center justify-between gap-3 rounded-lg px-1 py-1.5"
              >
                <label htmlFor={`chk-${c.key}`} className="text-sm">
                  {c.label}
                  {doneAt && checks[c.key] && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {fmt(doneAt)}
                    </span>
                  )}
                </label>
                <Switch
                  id={`chk-${c.key}`}
                  checked={!!checks[c.key]}
                  onCheckedChange={(on) => toggleCheck(c.key, on)}
                />
              </li>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : "저장"}
          </Button>
          {contact.updatedBy && (
            <span className="text-xs text-muted-foreground">
              마지막 저장 {fmt(contact.updatedAt)}, {contact.updatedBy}
            </span>
          )}
        </div>
      </section>

      <VocSection
        boothId={boothId}
        logs={logs}
        onAdded={(l) =>
          // 서버와 같은 순서(오간 시각 내림차순) — 지난 일을 나중에 적어도 제자리에 들어간다.
          setLogs((ls) => [l, ...ls].sort((x, y) => y.occurredAt.localeCompare(x.occurredAt)))
        }
      />
    </div>
  );
}

function VocSection({
  boothId,
  logs,
  onAdded,
}: {
  boothId: string;
  logs: BrandContactLog[];
  onAdded: (l: BrandContactLog) => void;
}) {
  const [direction, setDirection] =
    useState<BrandContactLogDirection>("outbound");
  const [kind, setKind] = useState<BrandContactLogKind>("message");
  const [channel, setChannel] = useState<BrandContactChannel | typeof NONE>(
    NONE,
  );
  const [summary, setSummary] = useState("");
  const [when, setWhen] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    try {
      const { log } = await api.post<{ log: BrandContactLog }>(
        `/api/admin/brands/contacts/${encodeURIComponent(boothId)}/logs`,
        {
          direction,
          kind,
          channel: channel === NONE ? null : channel,
          summary,
          ...(when ? { occurredAt: new Date(when).toISOString() } : {}),
        },
      );
      onAdded(log);
      setSummary("");
      setWhen("");
      toast.success("기록했어요");
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.error.message : "기록하지 못했어요",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <p className="text-xs font-bold text-muted-foreground">연락 기록(VOC)</p>
      <div className="space-y-3 rounded-xl border border-border p-3">
        <div className="grid grid-cols-3 gap-2">
          <Select
            value={direction}
            onValueChange={(v) => setDirection(v as BrandContactLogDirection)}
          >
            <SelectTrigger aria-label="방향">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_CONTACT_LOG_DIRECTIONS.map((d) => (
                <SelectItem key={d} value={d}>
                  {LOG_DIRECTION_LABEL[d]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={kind}
            onValueChange={(v) => setKind(v as BrandContactLogKind)}
          >
            <SelectTrigger aria-label="유형">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRAND_CONTACT_LOG_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {LOG_KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={channel}
            onValueChange={(v) =>
              setChannel(v as BrandContactChannel | typeof NONE)
            }
          >
            <SelectTrigger aria-label="채널">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>채널 없음</SelectItem>
              {BRAND_CONTACT_CHANNELS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CONTACT_CHANNEL_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Textarea
          rows={2}
          placeholder="무슨 말이 오갔는지 짧게 적어요"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          aria-label="내용"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="datetime-local"
            className="w-auto"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            aria-label="오간 시각"
          />
          <span className="text-xs text-muted-foreground">
            비우면 지금 시각으로 남아요
          </span>
          <Button
            size="sm"
            className="ml-auto"
            onClick={add}
            disabled={busy || !summary.trim()}
          >
            {busy ? <Loader2 className="animate-spin" /> : "기록 남기기"}
          </Button>
        </div>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 기록이 없어요.</p>
      ) : (
        <ol className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="rounded-xl bg-secondary/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {fmt(l.occurredAt)}, {LOG_DIRECTION_LABEL[l.direction]},{" "}
                {LOG_KIND_LABEL[l.kind]}
                {l.channel ? `, ${CONTACT_CHANNEL_LABEL[l.channel]}` : ""}
                {l.actor ? `, ${l.actor}` : ""}
              </p>
              <p
                className={cn(
                  "text-sm whitespace-pre-wrap",
                  (l.kind === "takedown-request" ||
                    l.kind === "edit-request") &&
                    "font-semibold text-destructive",
                )}
              >
                {l.summary}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
