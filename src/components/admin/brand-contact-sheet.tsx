"use client";

import { useEffect, useState } from "react";
import { AtSign, ExternalLink, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  ALLOWED_USE_LABEL,
  CONTACT_CHANNEL_LABEL,
  CONTACT_CHECKLIST,
  CONTACT_STATUS_VIEW_LABEL,
  LOG_DIRECTION_LABEL,
  LOG_KIND_LABEL,
} from "@/lib/brands/contact";
import { canonicalHandle, openRequest } from "@/lib/brands/contact-actions";
import { instagramDmUrl, instagramProfileUrl, isEmail, normalizeHandle } from "@/lib/brands/outreach";
import { STATUS_ORDER } from "@/lib/brands/board";
import type { ContactAction } from "@/lib/schemas";
import type { ContactView } from "@/lib/brands/contact-actions";
import type { LogItem, SubjectState } from "@/lib/brands/outreach-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { STATUS_STYLE } from "@/components/admin/brands/contact-status";

export interface ContactSheetTarget {
  brand: string;
  /** 출전(브랜드 × 박람회). 부스는 없어도 된다. */
  participantId: string;
  /** 박람회 이름, 부스 번호. */
  subtitle: string;
  /** 부스나 브랜드 공식 링크에서 온 계정. 컨택에 계정이 없으면 이걸 먼저 보여 주고 한 번 눌러 확정한다. */
  defaultHandle?: string | null;
}

export interface ActionResult {
  results: { participantId: string; state: SubjectState; log: LogItem }[];
  skipped: { participantId: string; reason: string }[];
  mode: "participant" | "booth";
}

/** 연락 동작 하나를 출전 여럿에 건다. 저장과 기록은 서버가 같이 한다(/api/admin/brands/contacts/actions). */
export function runContactAction(targets: { participantId: string; handle?: string }[], action: ContactAction) {
  return api.post<ActionResult>("/api/admin/brands/contacts/actions", { targets, action });
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d: string) => {
  const [, m, day] = d.split("-");
  return `${Number(m)}월 ${Number(day)}일`;
};

/**
 * 부스 하나의 연락. 흔한 일은 타자 없이 끝난다(2026-11-17 Ted: "입력칸에 직접 입력해야 하는 부분이 너무 많다").
 * - 상태, 허락 범위, 체크리스트: 누르면 바로 저장되고 기록이 남는다(저장 버튼 없음).
 * - 보낸 날짜는 오늘, 채널은 계정 모양에서, 누가는 관리자 쿠키에서 채운다.
 * - 계정은 부스나 브랜드 공식 링크로 미리 채우고 한 번 눌러 확정한다.
 * - 받은 연락은 버튼으로 남긴다. 받은 말 요지만 선택으로 적는다.
 */
export function BrandContactSheet({
  target,
  onClose,
  onChanged,
}: {
  target: ContactSheetTarget | null;
  onClose: () => void;
  onChanged: (participantId: string, view: ContactView, log: LogItem | null) => void;
}) {
  return (
    <Sheet open={!!target} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{target?.brand}</SheetTitle>
          <SheetDescription>{target?.subtitle}</SheetDescription>
        </SheetHeader>
        {/* key로 부스가 바뀔 때마다 새로 그린다 — 이전 부스의 입력이 남지 않게. */}
        {target && <ContactEditor key={target.participantId} target={target} onChanged={onChanged} />}
      </SheetContent>
    </Sheet>
  );
}

function ContactEditor({
  target,
  onChanged,
}: {
  target: ContactSheetTarget;
  onChanged: (participantId: string, view: ContactView, log: LogItem | null) => void;
}) {
  const { participantId } = target;
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<(SubjectState & { mode: string }) | null>(null);
  const contact = state?.view ?? null;
  const logs = state?.logs ?? [];
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<SubjectState & { mode: string }>(`/api/admin/brands/contacts/participants/${encodeURIComponent(participantId)}`)
      .then((d) => alive && setState(d))
      .catch((e) => toast.error(e instanceof ApiClientError ? e.error.message : "불러오지 못했어요"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [participantId]);

  /** 동작 하나 → 저장, 기록, 화면 반영. 성공하면 true. */
  async function act(id: string, action: ContactAction, okMsg?: string): Promise<boolean> {
    setBusy(id);
    try {
      const r = await runContactAction([{ participantId, handle: target.defaultHandle ?? undefined }], action);
      const hit = r.results[0];
      if (!hit) {
        toast.message(r.skipped[0]?.reason ?? "바뀐 게 없어요");
        return false;
      }
      setState((s) => ({ ...hit.state, mode: s?.mode ?? r.mode }));
      onChanged(participantId, hit.state.view, hit.log);
      if (okMsg) toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장하지 못했어요");
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (loading || !contact || !state)
    return (
      <div className="flex justify-center py-10">
        {loading ? (
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        ) : (
          <p className="text-sm text-muted-foreground">불러오지 못했어요. 닫고 다시 열어 주세요.</p>
        )}
      </div>
    );

  const canSend = (contact.status === "not-sent" || contact.status === "no-reply") && !contact.doNotContact;
  return (
    <div className="grid gap-6 px-5 pt-3 pb-8 md:grid-cols-2">
      {!state.writable && (
        <p className="rounded-xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground md:col-span-2">
          부스가 아직 없는 브랜드라 지금은 저장할 수 없어요. 연락 저장 자리를 브랜드 기준으로 옮기는 정리(STEP 1)가 운영에 들어가면 열려요.
        </p>
      )}
      <section className={cn("space-y-5", !state.writable && "pointer-events-none opacity-60")}>
        <HandleRow contact={contact} defaultHandle={target.defaultHandle ?? null} busy={busy} act={act} />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-muted-foreground">상태</p>
            {canSend && (
              <Button size="sm" onClick={() => act("mark-sent", { type: "mark-sent" }, "보냄으로 표시했어요")} disabled={!!busy}>
                {busy === "mark-sent" ? <Loader2 className="animate-spin" /> : <Send />}
                {contact.status === "no-reply" ? "다시 보냄으로 표시" : "보냄으로 표시"}
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="상태 바꾸기">
            {STATUS_ORDER.map((s) => {
              const on = contact.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  disabled={!!busy}
                  onClick={() => !on && act(`status-${s}`, { type: "set-status", status: s })}
                  className={cn(
                    "inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition-colors disabled:cursor-default",
                    on ? cn("border-transparent", STATUS_STYLE[s].chip, "ring-2 ring-ring/40") : "border-border bg-card hover:bg-secondary",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", STATUS_STYLE[s].dot)} aria-hidden />
                  {CONTACT_STATUS_VIEW_LABEL[s]}
                </button>
              );
            })}
          </div>
          <SentDate contact={contact} busy={busy} act={act} />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-bold text-muted-foreground">허락 범위</p>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...Object.keys(ALLOWED_USE_LABEL), ...contact.allowedUse])].map((tok) => {
              const on = contact.allowedUse.includes(tok);
              return (
                <button
                  key={tok}
                  type="button"
                  aria-pressed={on}
                  disabled={!!busy}
                  onClick={() => act(`use-${tok}`, { type: "toggle-use", token: tok, on: !on })}
                  className={cn(
                    "min-h-8 cursor-pointer rounded-full border px-2.5 text-xs font-semibold",
                    on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card",
                  )}
                >
                  {ALLOWED_USE_LABEL[tok] ?? tok}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-bold text-muted-foreground">체크리스트</p>
          <ul>
            {CONTACT_CHECKLIST.map((c) => {
              const doneAt = contact.checklist[c.key];
              return (
                <li key={c.key} className="flex items-center justify-between gap-3 px-1 py-1.5">
                  <label htmlFor={`chk-${c.key}`} className="text-sm">
                    {c.label}
                    {doneAt && <span className="ml-2 text-xs text-muted-foreground">{fmt(doneAt)}</span>}
                  </label>
                  <Switch
                    id={`chk-${c.key}`}
                    checked={!!doneAt}
                    disabled={!!busy}
                    onCheckedChange={(on) => act(`chk-${c.key}`, { type: "toggle-check", key: c.key, on })}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        <Sources contact={contact} busy={busy} act={act} />
        <DoNotContact contact={contact} busy={busy} act={act} brandLevel={state.mode === "participant"} />
        {state.updatedBy && state.updatedAt && (
          <p className="text-xs text-muted-foreground">
            마지막 저장 {fmt(state.updatedAt)}, {state.updatedBy}
          </p>
        )}
      </section>

      <div className={cn(!state.writable && "pointer-events-none opacity-60")}>
        <Inbox contact={contact} logs={logs} busy={busy} act={act} />
      </div>
    </div>
  );
}

type Act = (id: string, action: ContactAction, okMsg?: string) => Promise<boolean>;

/** 계정: 저장된 것 > 공식 링크(한 번 눌러 확정). 고치기는 예외일 때만 연다. */
function HandleRow({ contact, defaultHandle, busy, act }: { contact: ContactView; defaultHandle: string | null; busy: string | null; act: Act }) {
  const [editing, setEditing] = useState(false);
  const suggested = canonicalHandle(defaultHandle);
  const shown = contact.handle ?? suggested;
  const [draft, setDraft] = useState(shown ?? "");
  const ig = normalizeHandle(shown);
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-muted-foreground">연락할 곳</p>
      {shown ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{shown}</span>
          {!contact.handle && <span className="text-xs text-muted-foreground">부스나 브랜드 링크에서 가져왔어요</span>}
          {ig && (
            <>
              <a className="inline-flex items-center gap-0.5 text-xs underline" href={instagramProfileUrl(ig)} target="_blank" rel="noreferrer">
                <AtSign className="size-3" />
                프로필
              </a>
              <a className="inline-flex items-center gap-0.5 text-xs underline" href={instagramDmUrl(ig)} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3" />
                DM 열기
              </a>
            </>
          )}
          {isEmail(shown) && <Mail className="size-3.5 text-muted-foreground" aria-label="메일" />}
          {contact.channel && <span className="text-xs text-muted-foreground">{CONTACT_CHANNEL_LABEL[contact.channel]}</span>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">공식 링크에 계정이 없어요.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {!contact.handle && suggested && (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => act("handle", { type: "confirm-handle", handle: suggested }, "계정을 확정했어요")}>
            이 계정으로 확정
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)}>
          {editing ? "닫기" : shown ? "다른 계정 적기" : "계정 적기"}
        </Button>
      </div>
      {editing && (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act("handle", { type: "confirm-handle", handle: draft }, "계정을 바꿨어요")) setEditing(false);
          }}
        >
          <Input aria-label="인스타 계정이나 메일" placeholder="@계정 또는 메일" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" size="sm" disabled={!!busy || !draft.trim()}>
            확정
          </Button>
        </form>
      )}
    </div>
  );
}

/** 보낸 날짜는 "보냄"을 누를 때 오늘로 들어간다. 고치기는 예외일 때만. */
function SentDate({ contact, busy, act }: { contact: ContactView; busy: string | null; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact.sentAt ?? "");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">보낸 날짜</span>
      <span className="font-semibold">{contact.sentAt ? fmtDate(contact.sentAt) : "아직 없어요"}</span>
      {contact.sentAt && !editing && (
        <button type="button" className="cursor-pointer text-xs text-muted-foreground underline" onClick={() => setEditing(true)}>
          날짜 고치기
        </button>
      )}
      {editing && (
        <form
          className="flex items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (draft && (await act("sent-date", { type: "set-sent-date", sentAt: draft }))) setEditing(false);
          }}
        >
          <Input type="date" className="w-auto" aria-label="보낸 날짜" value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button type="submit" size="sm" disabled={!!busy || !draft}>
            확정
          </Button>
        </form>
      )}
    </div>
  );
}

/** 받은 사진과 글이 있는 곳. 흔한 일이 아니라 접어 둔다. */
function Sources({ contact, busy, act }: { contact: ContactView; busy: string | null; act: Act }) {
  const [photo, setPhoto] = useState(contact.photoSource ?? "");
  const [text, setText] = useState(contact.textSource ?? "");
  const has = contact.photoSource || contact.textSource || contact.notes;
  return (
    <details className="rounded-xl border border-border px-3 py-2" open={!!has}>
      <summary className="cursor-pointer text-xs font-bold text-muted-foreground">받은 사진과 글 위치(선택)</summary>
      <form
        className="mt-2 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          act("sources", { type: "set-sources", photoSource: photo, textSource: text }, "저장했어요");
        }}
      >
        <Input aria-label="사진 위치" placeholder="사진이 있는 경로나 링크" value={photo} onChange={(e) => setPhoto(e.target.value)} />
        <Input aria-label="글 위치" placeholder="글이 있는 경로나 링크" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" size="sm" variant="outline" disabled={!!busy}>
          위치 저장
        </Button>
        {contact.notes && (
          <p className="text-xs whitespace-pre-wrap text-muted-foreground">예전 메모: {contact.notes}</p>
        )}
      </form>
    </details>
  );
}

const RECEIVED = [
  { kind: "message", label: "답장 받음" },
  { kind: "permission", label: "허락 관련 답장" },
  { kind: "edit-request", label: "수정 요청 받음" },
  { kind: "takedown-request", label: "내려 달라는 요청" },
] as const;

/** 받은 연락은 버튼 하나로. 요지는 적고 싶을 때만. */
function Inbox({ contact, logs, busy, act }: { contact: ContactView; logs: LogItem[]; busy: string | null; act: Act }) {
  const [note, setNote] = useState("");
  const [memo, setMemo] = useState("");
  const open = openRequest(logs);
  return (
    <section className="space-y-3">
      <p className="text-xs font-bold text-muted-foreground">받은 연락과 기록</p>
      <div className="space-y-3 rounded-xl border border-border p-3">
        <Input
          aria-label="받은 말 요지(선택)"
          placeholder="받은 말 요지(선택). 비워도 버튼 이름이 기록돼요"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {RECEIVED.map((r) => (
            <Button
              key={r.kind}
              size="sm"
              variant={r.kind === "takedown-request" ? "destructive" : "outline"}
              disabled={!!busy}
              onClick={async () => {
                if (await act(`recv-${r.kind}`, { type: "received", kind: r.kind, note: note.trim() || null }, "기록했어요")) setNote("");
              }}
            >
              {r.label}
            </Button>
          ))}
          <Button size="sm" variant="outline" disabled={!!busy || !!contact.checklist["thanks-sent"]} onClick={() => act("thanks", { type: "thanks-sent" }, "기록했어요")}>
            감사 답장 보냄
          </Button>
        </div>
        {open && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2">
            <p className="text-sm font-semibold text-destructive">
              {open.kind === "takedown-request" ? "내려 달라는 요청" : "수정 요청"}이 처리 전이에요
            </p>
            <Button size="sm" disabled={!!busy} onClick={() => act("resolve", { type: "resolve-request" }, "처리함으로 남겼어요")}>
              처리함
            </Button>
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await act("memo", { type: "note", text: memo })) setMemo("");
          }}
        >
          <Input aria-label="내부 메모(선택)" placeholder="내부 메모(선택)" value={memo} onChange={(e) => setMemo(e.target.value)} />
          <Button type="submit" size="sm" variant="ghost" disabled={!!busy || !memo.trim()}>
            남기기
          </Button>
        </form>
      </div>
      {logs.length === 0 ? (
        <p className="text-sm text-muted-foreground">아직 기록이 없어요.</p>
      ) : (
        <ol className="space-y-2">
          {logs.map((l) => (
            <li key={l.id} className="rounded-xl bg-secondary/40 px-3 py-2">
              <p className="text-xs text-muted-foreground">
                {fmt(l.occurredAt)}, {LOG_DIRECTION_LABEL[l.direction]}, {LOG_KIND_LABEL[l.kind]}
                {l.channel ? `, ${CONTACT_CHANNEL_LABEL[l.channel]}` : ""}
                {l.actor ? `, ${l.actor}` : ""}
              </p>
              <p
                className={cn(
                  "text-sm whitespace-pre-wrap",
                  l.direction === "inbound" && (l.kind === "takedown-request" || l.kind === "edit-request") && "font-semibold text-destructive",
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

/** 연락 금지는 브랜드 전체(모든 박람회)에 걸린다. 내려 달라는 요청을 받았을 때 쓴다. */
function DoNotContact({ contact, busy, act, brandLevel }: { contact: ContactView; busy: string | null; act: Act; brandLevel: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2">
      <label htmlFor="dnc" className="text-sm">
        이 브랜드에 더 연락하지 않기
        <span className="block text-xs text-muted-foreground">
          {brandLevel ? "모든 박람회에 걸려요. 켜 두면 보냄 표시가 막혀요" : "스키마 정리(STEP 1) 뒤에 저장돼요"}
        </span>
      </label>
      <Switch
        id="dnc"
        checked={contact.doNotContact}
        disabled={!!busy || !brandLevel}
        onCheckedChange={(on) => act("dnc", { type: "set-do-not-contact", on })}
      />
    </div>
  );
}
