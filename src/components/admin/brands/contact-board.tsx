"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AtSign, ChevronRight, Copy, Loader2, Mail, MessageCircle, Search, Send, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { OUTREACH_SENDER } from "@/lib/constants";
import { ALLOWED_USE_LABEL, CONTACT_STATUS_LABEL, LOG_KIND_LABEL } from "@/lib/brands/contact";
import {
  ACTION_FLAG_LABEL,
  applyContactResult,
  filterRows,
  funnel,
  HANDLE_CONFIDENCE_LABEL,
  HANDLE_CONFIDENCES,
  SORT_LABEL,
  sortRows,
  STATUS_ORDER,
  type ActionFlag,
  type BoardRow,
  type HandleConfidence,
  type SortKey,
} from "@/lib/brands/board";
import { buildDm, instagramDmUrl, instagramProfileUrl, mailtoLink } from "@/lib/brands/outreach";
import type { ContactAction } from "@/lib/schemas";
import type { BrandContactStatus } from "@/lib/types";
import type { ContactView } from "@/lib/brands/contact-actions";
import type { LogItem } from "@/lib/brands/outreach-store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { EmptyState } from "@/components/common/states";
import { StatusChip, STATUS_STYLE } from "@/components/admin/brands/contact-status";
import { BrandContactSheet, runContactAction, type ContactSheetTarget } from "@/components/admin/brand-contact-sheet";
import { HandleImportSheet } from "@/components/admin/brands/handle-import-sheet";

const ALL = "all";
const PAGE = 100;
const CAN_SEND: ReadonlySet<BrandContactStatus> = new Set(["not-sent", "no-reply"]);
const READ_ONLY_HINT = "부스가 아직 없는 브랜드라 연락 상태를 저장할 수 없어요. 계정 열기와 DM 문구 복사는 돼요";

type Fair = { id: string; slug: string; name: string };

export function ContactBoard({
  exhibition,
  exhibitions,
  initialRows,
  today,
  mode,
  unlinkedBooths,
}: {
  exhibition: Fair;
  exhibitions: { id: string; name: string }[];
  initialRows: BoardRow[];
  today: string;
  /** 저장 자리. participant = 브랜드 연락처 + 출전 허락(목표), booth = 옛 부스 키(폴백). */
  mode: "participant" | "booth";
  /** 아직 브랜드로 정리되지 않은 부스 수(줄이 될 수 없다). */
  unlinkedBooths: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  // 가져오기 뒤 router.refresh()로 새 줄이 오면 갈아 끼운다(렌더 중 비교, effect 없이).
  const [seen, setSeen] = useState(initialRows);
  if (seen !== initialRows) {
    setSeen(initialRows);
    setRows(initialRows);
  }

  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<BrandContactStatus[]>([]);
  const [hasHandle, setHasHandle] = useState<typeof ALL | "yes" | "no">(ALL);
  const [confidence, setConfidence] = useState<typeof ALL | HandleConfidence | "none">(ALL);
  const [flag, setFlag] = useState<ActionFlag | null>(null);
  const [sort, setSort] = useState<SortKey>("code");
  const [shown, setShown] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState(0);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<ContactSheetTarget | null>(null);
  const [importing, setImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => funnel(rows), [rows]);
  const visible = useMemo(
    () =>
      sortRows(
        filterRows(rows, {
          q,
          statuses,
          hasHandle: hasHandle === ALL ? undefined : hasHandle === "yes",
          confidence: confidence === ALL ? undefined : confidence,
          flag: flag ?? undefined,
        }),
        sort,
      ),
    [rows, q, statuses, hasHandle, confidence, flag, sort],
  );
  const page = visible.slice(0, shown);
  // 보냄 뒤 넘어갈 줄. 렌더 중에 맞춘다(effect 없이, 위 seen과 같은 방식).
  if (pendingFocus) {
    setPendingFocus(null);
    const idx = page.findIndex((r) => r.key === pendingFocus);
    if (idx >= 0 && idx !== focus) setFocus(idx);
  }
  const filtered = q || statuses.length || hasHandle !== ALL || confidence !== ALL || flag;

  const resetPaging = () => {
    setShown(PAGE);
    setFocus(0);
  };
  const clearFilters = () => {
    setQ("");
    setStatuses([]);
    setHasHandle(ALL);
    setConfidence(ALL);
    setFlag(null);
    resetPaging();
  };

  /** 서버 결과를 줄에 반영. */
  const applyResults = useCallback(
    (results: { participantId: string; view: ContactView; log: LogItem | null }[]) => {
      const byId = new Map(results.map((r) => [r.participantId, r]));
      setRows((rs) =>
        rs.map((row) => {
          const hit = byId.get(row.ref.participantId);
          return hit ? applyContactResult(row, hit.view, hit.log, today) : row;
        }),
      );
    },
    [today],
  );

  const act = useCallback(
    async (targets: BoardRow[], action: ContactAction, okMsg: (n: number) => string) => {
      const writable = targets.filter((r) => r.writable);
      if (writable.length === 0) {
        toast.message(READ_ONLY_HINT);
        return 0;
      }
      setBusy(true);
      let done = 0;
      try {
        const r = await runContactAction(
          writable.map((row) => ({
            participantId: row.ref.participantId,
            ...(row.handle ? { handle: `@${row.handle}` } : row.email ? { handle: row.email } : {}),
          })),
          action,
        );
        applyResults(r.results.map((x) => ({ participantId: x.participantId, view: x.state.view, log: x.log })));
        if (r.results.length) toast.success(okMsg(r.results.length));
        done = r.results.length;
        if (r.skipped.length)
          toast.message(`${r.skipped.length}곳은 그대로 뒀어요`, {
            description: [...new Set(r.skipped.map((s) => s.reason))].join(", "),
          });
      } catch (e) {
        toast.error(e instanceof ApiClientError ? e.error.message : "저장하지 못했어요");
      } finally {
        setBusy(false);
      }
      return done;
    },
    [applyResults],
  );

  const markSent = useCallback(
    (targets: BoardRow[]) => act(targets, { type: "mark-sent" }, (n) => `${n}곳을 보냄으로 표시했어요. 보낸 날짜는 오늘이에요`),
    [act],
  );
  /**
   * 한 줄을 보냄으로 표시하고 다음 줄로 넘어간다(s 키, 줄의 보냄 버튼). 저장이 안 되면 그 줄에 남는다.
   * 거르기 때문에 보낸 줄이 목록에서 빠져도 같은 다음 줄로 가도록 index가 아니라 key로 찾는다.
   */
  const markSentAndNext = useCallback(
    async (row: BoardRow, index: number) => {
      const nextKey = page[index + 1]?.key ?? null;
      const n = await markSent([row]);
      if (n > 0 && nextKey) setPendingFocus(nextKey);
    },
    [markSent, page],
  );
  const setStatus = useCallback(
    (row: BoardRow, status: BrandContactStatus) =>
      act([row], { type: "set-status", status }, () => `${row.name}: ${CONTACT_STATUS_LABEL[status]}`),
    [act],
  );

  const copyDm = useCallback(
    async (row: BoardRow) => {
      const text = buildDm(exhibition.slug, { brand: row.name, fair: exhibition.name, items: row.items });
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        toast.error("클립보드에 넣지 못했어요. 브라우저 권한을 확인해 주세요");
        return;
      }
      if (row.doNotContact) {
        toast.message("연락하지 않기로 한 브랜드예요", { description: row.name });
        return;
      }
      const canMark = row.writable && CAN_SEND.has(row.status);
      toast.success(`${row.name} DM 문구를 복사했어요`, {
        description: `@${OUTREACH_SENDER.instagram} 계정에서 붙여 넣어 보내 주세요`,
        ...(canMark ? { action: { label: "보냄으로 표시", onClick: () => markSent([row]) } } : {}),
      });
    },
    [exhibition, markSent],
  );

  const openSheet = useCallback(
    (row: BoardRow) => {
      setSheet({
        brand: row.name,
        participantId: row.ref.participantId,
        subtitle: `${exhibition.name}${row.code ? `, 부스 ${row.code}` : ""}`,
        defaultHandle: row.handle ? `@${row.handle}` : row.email,
      });
    },
    [exhibition.name],
  );

  const toggleSelect = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const selectable = page.filter((r) => r.writable);
  const allOnPage = selectable.length > 0 && selectable.every((r) => selected.has(r.key));
  const selectedRows = rows.filter((r) => selected.has(r.key));

  // 키보드: / 찾기, j k 줄 이동, x 고르기, c 문구 복사, s 보냄 후 다음 줄, o 프로필, Enter 자세히, 1~9 상태, Esc 선택 풀기.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (sheet || importing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && (t.closest("input, textarea, select, [contenteditable=true], [role=menu], [role=listbox]") || t.isContentEditable)) {
        if (e.key === "Escape" && t === searchRef.current) searchRef.current?.blur();
        return;
      }
      const row = page[focus];
      const k = e.key;
      if (k === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (k === "j" || k === "ArrowDown") {
        e.preventDefault();
        setFocus((i) => Math.min(i + 1, page.length - 1));
      } else if (k === "k" || k === "ArrowUp") {
        e.preventDefault();
        setFocus((i) => Math.max(i - 1, 0));
      } else if (k === "Escape") setSelected(new Set());
      else if (!row) return;
      else if (k === "x" && row.writable) toggleSelect(row.key);
      else if (k === "c") copyDm(row);
      else if (k === "s") markSentAndNext(row, focus);
      else if (k === "o" && row.handle) window.open(instagramProfileUrl(row.handle), "_blank", "noopener");
      else if (k === "Enter") openSheet(row);
      else if (/^[1-9]$/.test(k)) setStatus(row, STATUS_ORDER[Number(k) - 1]);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [page, focus, sheet, importing, copyDm, markSentAndNext, openSheet, setStatus]);

  useEffect(() => {
    document.getElementById(`row-${focus}`)?.scrollIntoView({ block: "nearest" });
  }, [focus]);

  const sentTotal = stats.total - stats.byStatus["not-sent"];
  const answered = stats.byStatus.replied + stats.byStatus.granted + stats.byStatus.partial + stats.byStatus.declined + stats.byStatus.withdrawn;
  const granted = stats.byStatus.granted + stats.byStatus.partial;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={exhibition.id} onValueChange={(id) => router.push(`/admin/brands/contacts?fair=${encodeURIComponent(id)}`)}>
          <SelectTrigger className="w-72 max-w-full" aria-label="박람회">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {exhibitions.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          보내는 곳은 Roam 계정뿐이에요. 인스타 <b className="text-foreground">@{OUTREACH_SENDER.instagram}</b>, 메일{" "}
          <b className="text-foreground">{OUTREACH_SENDER.email}</b>. 이 화면은 보내지 않아요.
        </p>
        <Button variant="outline" className="h-9 md:ml-auto" onClick={() => setImporting(true)}>
          <Upload />
          인스타 계정 가져오기
        </Button>
      </div>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-base font-extrabold">브랜드 {stats.total}곳</p>
          <p className="text-sm text-muted-foreground">
            보냄 <b className="text-foreground tabular-nums">{sentTotal}</b>, 답이 옴{" "}
            <b className="text-foreground tabular-nums">{answered}</b>, 허락 <b className="text-foreground tabular-nums">{granted}</b>
            {stats.noHandle > 0 && (
              <>
                , 계정 모름 <b className="text-foreground tabular-nums">{stats.noHandle}</b>
              </>
            )}
          </p>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label="상태별 비율">
          {STATUS_ORDER.map((s) =>
            stats.byStatus[s] > 0 ? (
              <div
                key={s}
                className={cn("h-full", STATUS_STYLE[s].bar)}
                style={{ width: `${(stats.byStatus[s] / Math.max(stats.total, 1)) * 100}%` }}
                title={`${CONTACT_STATUS_LABEL[s]} ${stats.byStatus[s]}`}
              />
            ) : null,
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9">
          {STATUS_ORDER.map((s, i) => {
            const on = statuses.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setStatuses((xs) => (on ? xs.filter((x) => x !== s) : [...xs, s]));
                  resetPaging();
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                  on ? "border-primary bg-primary/5" : "border-transparent hover:bg-secondary",
                )}
                title={`숫자 ${i + 1}: 고른 줄을 이 상태로`}
              >
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={cn("size-2 rounded-full", STATUS_STYLE[s].dot)} aria-hidden />
                  {CONTACT_STATUS_LABEL[s]}
                </span>
                <span className="text-lg font-extrabold tabular-nums">{stats.byStatus[s]}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(ACTION_FLAG_LABEL) as ActionFlag[]).map((f) => {
          const n = stats.flags[f];
          const on = flag === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              disabled={n === 0 && !on}
              onClick={() => {
                setFlag(on ? null : f);
                resetPaging();
              }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors disabled:cursor-default",
                n === 0
                  ? "border-border bg-card text-muted-foreground"
                  : f === "request-open"
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-warning/50 bg-warning/10",
                on && "ring-2 ring-primary",
              )}
            >
              <span className="text-sm font-semibold">{ACTION_FLAG_LABEL[f]}</span>
              <span className="text-2xl font-extrabold tabular-nums">{n}</span>
            </button>
          );
        })}
      </div>

      {mode === "booth" && stats.readOnly > 0 && (
        <p className="rounded-xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
          부스가 아직 없는 브랜드 <b className="text-foreground">{stats.readOnly}곳</b>은 연락 상태를 저장할 수 없어요. 연락 저장 자리를
          브랜드와 출전 기준으로 옮기는 정리(STEP 1)가 운영에 들어가면 열려요. 지금도 계정 열기와 DM 문구 복사는 돼요.
        </p>
      )}
      {unlinkedBooths > 0 && (
        <p className="rounded-xl bg-secondary px-4 py-2.5 text-sm text-muted-foreground">
          아직 브랜드로 정리되지 않은 부스 {unlinkedBooths}곳은 여기 안 보여요.{" "}
          <Link href="/admin/brands" className="underline">
            브랜드 목록
          </Link>
          에서 &quot;출전 정리하기&quot;를 누르면 보여요.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={searchRef}
            className="h-10 pl-9"
            placeholder="이름, 부스 번호, 계정으로 찾기 ( / )"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPaging();
            }}
            aria-label="이름으로 찾기"
          />
        </div>
        <Select
          value={hasHandle}
          onValueChange={(v) => {
            setHasHandle(v as typeof hasHandle);
            resetPaging();
          }}
        >
          <SelectTrigger className="h-10 w-36" aria-label="계정">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>계정 전체</SelectItem>
            <SelectItem value="yes">계정 있음</SelectItem>
            <SelectItem value="no">계정 없음</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={confidence}
          onValueChange={(v) => {
            setConfidence(v as typeof confidence);
            resetPaging();
          }}
        >
          <SelectTrigger className="h-10 w-40" aria-label="계정 믿을 만한 정도">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>계정 출처 전체</SelectItem>
            {HANDLE_CONFIDENCES.map((c) => (
              <SelectItem key={c} value={c}>
                {HANDLE_CONFIDENCE_LABEL[c]}
              </SelectItem>
            ))}
            <SelectItem value="none">계정 없음</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
          <SelectTrigger className="h-10 w-44" aria-label="정렬">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                {SORT_LABEL[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" className="h-10" onClick={clearFilters}>
            필터 풀기
          </Button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-card px-4 py-2 shadow-sm">
          <p className="text-sm font-bold">{selected.size}곳 골랐어요</p>
          <Button className="h-9" disabled={busy} onClick={() => markSent(selectedRows).then(() => setSelected(new Set()))}>
            {busy ? <Loader2 className="animate-spin" /> : <Send />}
            보냄으로 표시
          </Button>
          <span className="text-xs text-muted-foreground">보낸 날짜는 오늘로, 기록도 한 줄씩 남아요</span>
          <Button variant="ghost" className="ml-auto h-9" onClick={() => setSelected(new Set())}>
            <X />
            선택 풀기
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? "이 박람회에는 아직 브랜드가 없어요" : "조건에 맞는 브랜드가 없어요"}
          description={rows.length === 0 ? "인입에서 브랜드나 부스를 먼저 넣어 주세요." : "필터를 풀거나 다른 이름으로 찾아 보세요."}
          bordered
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] table-fixed text-sm">
            <colgroup>
              <col className="w-10" />
              <col className="w-[20%]" />
              <col className="w-[21%]" />
              <col className="w-[104px]" />
              <col className="w-14" />
              <col />
              <col className="w-[168px]" />
            </colgroup>
            <thead className="border-b border-border text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="이 페이지 모두 고르기"
                    className="size-4 cursor-pointer accent-[var(--primary)]"
                    checked={allOnPage}
                    onChange={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        for (const r of selectable) {
                          if (allOnPage) n.delete(r.key);
                          else n.add(r.key);
                        }
                        return n;
                      })
                    }
                  />
                </th>
                <th className="px-2 py-2 font-semibold">브랜드</th>
                <th className="px-2 py-2 font-semibold">인스타</th>
                <th className="px-2 py-2 font-semibold">상태</th>
                <th className="px-2 py-2 text-right font-semibold whitespace-nowrap">보낸 지</th>
                <th className="px-2 py-2 font-semibold">마지막 기록, 허락 범위</th>
                <th className="px-3 py-2 text-right font-semibold">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {page.map((row, i) => (
                <BoardTableRow
                  key={row.key}
                  index={i}
                  row={row}
                  focused={i === focus}
                  selected={selected.has(row.key)}
                  busy={busy}
                  fairName={exhibition.name}
                  fairSlug={exhibition.slug}
                  onFocus={() => setFocus(i)}
                  onToggle={() => toggleSelect(row.key)}
                  onStatus={(s) => setStatus(row, s)}
                  onCopy={() => copyDm(row)}
                  onSent={() => {
                    setFocus(i);
                    markSentAndNext(row, i);
                  }}
                  onOpen={() => openSheet(row)}
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {visible.length > shown && (
        <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
          더 보기 ({visible.length - shown}곳 남음)
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        단축키: / 찾기, j k 줄 이동, x 고르기, c DM 문구 복사, s 보냄으로 표시하고 다음 줄로, o 프로필 열기, Enter 자세히, 1~9 상태 바꾸기
        (아직 안 보냄부터 철회까지 순서), Esc 선택 풀기
      </p>

      <BrandContactSheet
        target={sheet}
        onClose={() => setSheet(null)}
        onChanged={(participantId, view, log) => applyResults([{ participantId, view, log }])}
      />
      <HandleImportSheet
        open={importing}
        onClose={() => setImporting(false)}
        exhibition={exhibition}
        onApplied={() => router.refresh()}
      />
    </div>
  );
}

function BoardTableRow({
  index,
  row,
  focused,
  selected,
  busy,
  fairName,
  fairSlug,
  onFocus,
  onToggle,
  onStatus,
  onCopy,
  onSent,
  onOpen,
}: {
  index: number;
  row: BoardRow;
  focused: boolean;
  selected: boolean;
  busy: boolean;
  fairName: string;
  fairSlug: string;
  onFocus: () => void;
  onToggle: () => void;
  onStatus: (s: BrandContactStatus) => void;
  onCopy: () => void;
  onSent: () => void;
  onOpen: () => void;
}) {
  const canSend = row.writable && CAN_SEND.has(row.status) && !row.doNotContact;
  return (
    <tr
      id={`row-${index}`}
      data-participant-id={row.ref.participantId}
      data-handle={row.handle ?? undefined}
      onClick={onFocus}
      className={cn(
        "align-middle transition-colors",
        selected ? "bg-primary/5" : "hover:bg-secondary/40",
        focused && "outline-2 -outline-offset-2 outline-primary/60",
        !row.writable && "text-foreground/80",
      )}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          aria-label={`${row.name} 고르기`}
          className="size-4 cursor-pointer accent-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-30"
          checked={selected}
          disabled={!row.writable}
          title={row.writable ? undefined : READ_ONLY_HINT}
          onChange={onToggle}
        />
      </td>
      <td className="px-2 py-2">
        <p className="truncate font-semibold" title={row.name}>
          {row.name}
        </p>
        <p className="text-xs text-muted-foreground">
          {row.doNotContact && <span className="mr-1.5 font-semibold text-destructive">연락 금지</span>}
          {row.code ? `부스 ${row.code}` : "부스 아직 없음"}
          {row.flags.length > 0 && (
            <span className={cn("ml-1.5 font-semibold", row.flags.includes("request-open") ? "text-destructive" : "text-foreground")}>
              {row.flags.map((f) => FLAG_SHORT[f]).join(", ")}
            </span>
          )}
        </p>
      </td>
      <td className="px-2 py-2">
        {row.handle ? (
          <div className="flex min-w-0 items-center gap-1">
            <a
              href={instagramProfileUrl(row.handle)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-0.5 font-medium text-primary hover:underline"
              title="프로필 새 탭에서 열기"
            >
              <AtSign className="size-3.5 shrink-0" />
              <span className="truncate">{row.handle}</span>
            </a>
            <a
              href={instagramDmUrl(row.handle)}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label={`${row.name} DM 새 탭에서 열기`}
              title="DM 새 탭에서 열기"
            >
              <MessageCircle className="size-3.5" />
            </a>
            {row.handleConfidence && row.handleConfidence !== "official" && row.handleConfidence !== "confirmed" && (
              <span
                className={cn(
                  "shrink-0 rounded px-1 text-[11px] font-semibold",
                  row.handleConfidence === "candidate" ? "bg-warning/20 text-foreground" : "bg-secondary text-muted-foreground",
                )}
              >
                {HANDLE_CONFIDENCE_LABEL[row.handleConfidence]}
              </span>
            )}
          </div>
        ) : row.email ? (
          <a
            href={mailtoLink(row.email, fairSlug, { brand: row.name, fair: fairName, items: row.items })}
            className="inline-flex items-center gap-1 text-primary hover:underline"
            title={`메일 초안 열기. 보내는 주소는 ${OUTREACH_SENDER.email}로 골라 주세요`}
          >
            <Mail className="size-3.5" />
            {row.email}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">계정 모름</span>
        )}
      </td>
      <td className="px-2 py-2">
        {row.writable ? (
          <Menu>
            <MenuTrigger asChild>
              <button type="button" className="cursor-pointer rounded-full" aria-label={`${row.name} 상태 바꾸기`} disabled={busy}>
                <StatusChip status={row.status} />
              </button>
            </MenuTrigger>
            <MenuContent align="start">
              {STATUS_ORDER.map((s, i) => (
                <MenuItem key={s} disabled={s === row.status} onSelect={() => onStatus(s)}>
                  <span className={cn("size-2 rounded-full", STATUS_STYLE[s].dot)} aria-hidden />
                  <span className="flex-1">{CONTACT_STATUS_LABEL[s]}</span>
                  <kbd className="text-xs text-muted-foreground">{i + 1}</kbd>
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : (
          <span title={READ_ONLY_HINT}>
            <StatusChip status={row.status} className="opacity-60" />
          </span>
        )}
      </td>
      <td
        className={cn(
          "px-2 py-2 text-right tabular-nums",
          row.flags.includes("overdue") ? "font-bold text-foreground" : "text-muted-foreground",
        )}
      >
        {row.daysSinceSent === null ? "" : row.daysSinceSent === 0 ? "오늘" : `${row.daysSinceSent}일`}
      </td>
      <td className="px-2 py-2">
        {row.lastLog ? (
          <p
            className={cn(
              "truncate text-xs",
              row.lastLog.direction === "inbound" && (row.lastLog.kind === "takedown-request" || row.lastLog.kind === "edit-request")
                ? "font-semibold text-destructive"
                : "text-foreground/80",
            )}
            title={`${LOG_KIND_LABEL[row.lastLog.kind]}: ${row.lastLog.summary}`}
          >
            {row.lastLog.summary}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">기록 없음</p>
        )}
        {row.allowedUse.length > 0 && (
          <p className="truncate text-[11px] text-muted-foreground">{row.allowedUse.map((t) => ALLOWED_USE_LABEL[t] ?? t).join(", ")}</p>
        )}
      </td>
      <td className="px-2 py-1.5">
        <div className="flex items-center justify-end gap-0.5">
          <Button variant="ghost" className="h-8 px-2 text-xs" onClick={onCopy} title="DM 문구 복사 (c)">
            <Copy className="size-3.5" />
            문구
          </Button>
          <Button
            variant={canSend ? "outline" : "ghost"}
            className="h-8 px-2 text-xs"
            onClick={onSent}
            disabled={!canSend || busy}
            title={row.writable ? "보냄으로 표시 (s)" : READ_ONLY_HINT}
          >
            <Send className="size-3.5" />
            보냄
          </Button>
          <Button
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={onOpen}
            aria-label={`${row.name} 자세히`}
            title="자세히 (Enter)"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </td>
    </tr>
  );
}

const FLAG_SHORT: Record<ActionFlag, string> = {
  overdue: "답 기다림 7일+",
  "reply-unprocessed": "답장 처리 전",
  "request-open": "요청 처리 전",
};
