import Link from "next/link";
import {
  AlertTriangle,
  Bug,
  ClipboardCheck,
  FileText,
  GitCompare,
  Link2,
  MessageCircle,
  Upload,
  type LucideIcon,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { FairPortfolioLink } from "@/components/admin/fair-portfolio-link";
import { needsAction, type FairCount, type QueueKey, type TodayItem } from "@/lib/admin/today";
import { cn } from "@/lib/utils";

const ICON: Record<QueueKey, LucideIcon> = {
  articles: FileText,
  contacts: MessageCircle,
  brandLinks: Link2,
  drafts: ClipboardCheck,
  verify: GitCompare,
  intake: Upload,
  errors: Bug,
  dataIssues: AlertTriangle,
};

/** 처리할 게 있을 때만 색을 쓴다. 색은 디자인 토큰(primary, warning, destructive)만. */
const TONE = {
  act: { card: "border-primary/40 bg-primary/5", text: "text-primary" },
  warn: { card: "border-warning/50 bg-warning/5", text: "text-warning" },
  error: { card: "border-destructive/40 bg-destructive/5", text: "text-destructive" },
} as const;

/** 박람회별 줄은 이만큼만 보이고 나머지는 "N곳 더"로 접는다. */
const MAX_FAIRS = 3;

function secondaryLabel(item: TodayItem): string {
  return item.count.state === "ok" ? (item.count.secondary?.label ?? "") : "";
}

/** 박람회 하나를 보는 큐. 연락 현황은 `?fair=`로 고르고, 나머지는 선택기와 같은 쿠키로 고른다. */
function FairLine({ item, fair }: { item: TodayItem; fair: FairCount }) {
  const cls =
    "press -mx-1.5 flex items-center justify-between gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-secondary active:bg-card-pressed";
  const body = (
    <>
      <span className="min-w-0 truncate text-muted-foreground">{fair.name}</span>
      <span className="shrink-0 tabular">
        <span className="font-semibold">{fair.count}</span>
        {(fair.secondary ?? 0) > 0 && (
          <span className="ml-1.5 text-muted-foreground">
            {secondaryLabel(item)} {fair.secondary}
          </span>
        )}
      </span>
    </>
  );
  if (item.key === "contacts") {
    return (
      <Link href={`${item.href}?fair=${encodeURIComponent(fair.slug)}`} className={cls}>
        {body}
      </Link>
    );
  }
  return (
    <FairPortfolioLink exhibitionId={fair.exhibitionId} href={item.href} className={cls}>
      {body}
    </FairPortfolioLink>
  );
}

function QueueCard({ item }: { item: TodayItem }) {
  const Icon = ICON[item.key];
  const active = needsAction(item.count);
  const tone = TONE[item.tone];
  const c = item.count;
  const fairs = c.state === "ok" && c.byFair && c.byFair.length > 0 ? c.byFair : null;
  const notes = active && c.state === "ok" && c.notes && c.notes.length > 0 ? c.notes : null;

  const head = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className={cn("text-sm font-bold", !active && "text-muted-foreground")}>{item.label}</p>
        <p className="mt-0.5 hidden text-xs text-muted-foreground sm:block">{item.hint}</p>
      </div>
      <Icon className={cn("size-5 shrink-0", active ? tone.text : "text-muted-foreground/60")} aria-hidden />
    </div>
  );
  const value =
    c.state === "unavailable" ? (
      <p className="mt-3 text-sm font-semibold text-muted-foreground">{c.reason}</p>
    ) : active ? (
      <p className={cn("mt-3 text-3xl font-extrabold tabular", tone.text)}>
        {c.count}
        <span className="ml-0.5 text-base font-bold">건{c.atLeast ? " 이상" : ""}</span>
        {c.secondary && c.secondary.count > 0 && (
          <span className="ml-2 text-sm font-semibold text-muted-foreground">
            {c.secondary.label} {c.secondary.count}
          </span>
        )}
      </p>
    ) : (
      <p className="mt-3 text-sm font-semibold text-muted-foreground">없어요</p>
    );

  const cardCls = cn("h-full p-4", active ? tone.card : "bg-card shadow-none");

  // 박람회별 줄이 있으면 카드 전체를 링크로 감싸지 않는다(링크 안의 링크 금지). 머리만 큐로 간다.
  if (active && fairs) {
    return (
      <Card className={cardCls}>
        <Link href={item.href} className="press block rounded-md">
          {head}
          {value}
        </Link>
        <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2">
          {fairs.slice(0, MAX_FAIRS).map((f) => (
            <li key={f.exhibitionId}>
              <FairLine item={item} fair={f} />
            </li>
          ))}
          {fairs.length > MAX_FAIRS && (
            <li className="px-0 pt-0.5 text-xs text-muted-foreground">{fairs.length - MAX_FAIRS}곳 더 있어요</li>
          )}
        </ul>
      </Card>
    );
  }
  return (
    <Link href={item.href} className="block h-full">
      <Card className={cn(cardCls, "press active:bg-card-pressed")}>
        {head}
        {value}
        {notes && (
          <ul className="mt-2 space-y-0.5 border-t border-border/60 pt-2 text-xs text-muted-foreground">
            {notes.slice(0, MAX_FAIRS).map((n) => (
              <li key={n} className="truncate">
                {n}
              </li>
            ))}
            {notes.length > MAX_FAIRS && <li>{notes.length - MAX_FAIRS}곳 더 있어요</li>}
          </ul>
        )}
      </Card>
    </Link>
  );
}

/**
 * 관리자 홈 맨 위. 할 일이 있는 큐만 카드로 띄우고, 0과 준비 전은 한 줄로 접어 조용히 둔다
 * (빈 카드가 큰 칸을 차지하면 할 일이 있는 카드가 묻힌다).
 */
export function TodayQueue({ items }: { items: TodayItem[] }) {
  const open = items.filter((i) => needsAction(i.count));
  const quiet = items.filter((i) => i.count.state === "ok" && i.count.count === 0);
  // 못 센 큐는 "할 일 없음"에 넣지 않는다. 세지 못한 것을 없다고 말하면 사실보다 크다.
  const unknown = items.filter((i) => i.count.state === "unavailable");
  const summary =
    open.length > 0
      ? `${open.length}개 항목에 할 일이 있어요`
      : unknown.length > 0
        ? `센 곳에는 처리할 게 없어요. ${unknown.length}개는 아직 못 셌어요`
        : "지금은 처리할 게 없어요";
  return (
    <section className="space-y-3" aria-labelledby="today-queue-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="today-queue-title" className="text-lg font-extrabold">
          처리할 것
        </h2>
        <p className="text-sm text-muted-foreground">
          {summary}
        </p>
      </div>
      {open.length > 0 && (
        <ul className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {open.map((item) => (
            <li key={item.key}>
              <QueueCard item={item} />
            </li>
          ))}
        </ul>
      )}
      <QuietLine title="할 일 없음" items={quiet} />
      <QuietLine title="아직 못 셈" items={unknown} />
    </section>
  );
}

/** 0이거나 못 센 큐를 한 줄로 접는다. 못 센 큐는 이유(준비 전 등)를 붙인다. */
function QuietLine({ title, items }: { title: string; items: TodayItem[] }) {
  if (items.length === 0) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-1 gap-y-1 text-sm text-muted-foreground">
      <span className="font-semibold">{title}:</span>
      {items.map((item, i) => (
        <span key={item.key}>
          <Link href={item.href} className="underline-offset-2 hover:underline">
            {item.label}
            {item.count.state === "unavailable" && `(${item.count.reason})`}
          </Link>
          {i < items.length - 1 && ","}
        </span>
      ))}
    </p>
  );
}
