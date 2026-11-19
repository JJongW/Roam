// 관리자 홈 "오늘 처리할 것"과 "다가오는 박람회" — 순수 계산. I/O 없음.
//
// 왜 홈 맨 위인가(2026-11-19 Ted 화면 비평): 홈이 지표부터 보여 줘서 "오늘 무엇을 해야 하나"를
// 화면 맨 아래 오류 카드까지 내려가야 알았다. 숫자를 세는 일은 이미 있는 저장소 함수와
// 화면 계산을 그대로 쓰고, 여기서는 묶고 순서만 정한다(today-load.ts가 읽는다).
import type { RepoFile } from "@/lib/intake/queue";

/** 박람회 하나의 대기 건수. 줄을 누르면 그 박람회를 고른 채 큐로 간다. */
export interface FairCount {
  exhibitionId: string;
  slug: string;
  name: string;
  count: number;
  /** 같은 화면의 두 번째 숫자(초안 검수의 "직접 조사"). 없으면 0으로 본다. */
  secondary?: number;
}

/**
 * 한 큐의 건수.
 * - ok: 셌다. `atLeast`면 조회 상한에 걸려 실제는 더 많다.
 * - unavailable: 셀 자리가 아직 없다(마이그레이션 전 등). 0으로 위장하지 않는다(CLAUDE.md "없음과 비어 있음").
 */
export type QueueCount =
  | {
      state: "ok";
      count: number;
      atLeast?: boolean;
      byFair?: FairCount[];
      notes?: string[];
      /** 두 번째 숫자와 그 이름. 큐 화면에 같은 이름으로 따로 보이는 것만 쓴다. */
      secondary?: { label: string; count: number };
    }
  | { state: "unavailable"; reason: string };

export const QUEUE_KEYS = [
  "articles",
  "contacts",
  "brandLinks",
  "drafts",
  "verify",
  "intake",
  "errors",
  "dataIssues",
] as const;
export type QueueKey = (typeof QUEUE_KEYS)[number];

/** 카드에 보이는 이름과 설명, 큐 주소. 순서가 곧 우선순위다(Ted가 직접 결정할 것 먼저). */
export const QUEUE_META: Record<QueueKey, { label: string; hint: string; href: string; tone: "act" | "warn" | "error" }> = {
  articles: { label: "아티클 승인 대기", hint: "승인해야 공개돼요", href: "/admin/articles", tone: "act" },
  contacts: { label: "브랜드 연락 할 일", hint: "답장, 요청, 7일 넘은 무응답", href: "/admin/brands/contacts", tone: "act" },
  brandLinks: { label: "브랜드 확인 대기", hint: "이름만 같은 브랜드", href: "/admin/brands/links", tone: "act" },
  drafts: { label: "초안 검수 대기", hint: "사람이 볼 초안, 박람회마다 따로 세요", href: "/admin/enrichment", tone: "act" },
  verify: { label: "대조 검수 대기", hint: "확인한 글과 다른 소개", href: "/admin/verify", tone: "act" },
  intake: { label: "인입 대기", hint: "끝나지 않은 박람회, 올리면 바뀌는 파일", href: "/admin/intake", tone: "act" },
  errors: { label: "오류", hint: "최근 30일, 묶은 건수", href: "/admin/errors", tone: "error" },
  dataIssues: { label: "데이터 이슈", hint: "진행 중이거나 다가오는 박람회, 빈 필수 칸과 기록 어긋남", href: "/admin/errors?tab=data", tone: "warn" },
};

export interface TodayItem {
  key: QueueKey;
  label: string;
  hint: string;
  href: string;
  tone: "act" | "warn" | "error";
  count: QueueCount;
}

/** 처리할 게 있는 카드인가. 준비 전과 0은 조용히 둔다. */
export function needsAction(c: QueueCount): boolean {
  return c.state === "ok" && (c.count > 0 || (c.secondary?.count ?? 0) > 0);
}

/**
 * 카드 순서: 처리할 게 있는 것이 위, 0과 준비 전은 아래로 가라앉는다.
 * 같은 무리 안에서는 QUEUE_KEYS 순서(우선순위)를 지킨다.
 */
export function buildTodayItems(counts: Record<QueueKey, QueueCount>): TodayItem[] {
  const items = QUEUE_KEYS.map((key) => ({ key, ...QUEUE_META[key], count: counts[key] }));
  return [...items.filter((i) => needsAction(i.count)), ...items.filter((i) => !needsAction(i.count))];
}

/** 박람회별로 센다. 모르는 박람회 id(지운 행사 등)는 버리지 않고 이름 없이 남긴다. */
export function countByFair(
  rows: { exhibitionId: string }[],
  fairs: { id: string; slug: string; name: string }[],
): FairCount[] {
  const byId = new Map(fairs.map((f) => [f.id, f]));
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.exhibitionId, (counts.get(r.exhibitionId) ?? 0) + 1);
  return [...counts]
    .map(([id, count]) => {
      const f = byId.get(id);
      return { exhibitionId: id, slug: f?.slug ?? id, name: f?.name ?? "알 수 없는 박람회", count };
    })
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** 박람회별 건수를 한 큐로 합친다. 0인 박람회는 줄에서 뺀다. */
export function sumFairs(byFair: FairCount[], atLeast = false, secondaryLabel?: string): QueueCount {
  const rows = byFair
    .filter((f) => f.count > 0 || (f.secondary ?? 0) > 0)
    .sort((a, b) => b.count - a.count || (b.secondary ?? 0) - (a.secondary ?? 0) || a.name.localeCompare(b.name));
  const secondary = rows.reduce((s, f) => s + (f.secondary ?? 0), 0);
  return {
    state: "ok",
    count: rows.reduce((s, f) => s + f.count, 0),
    atLeast: atLeast || undefined,
    byFair: rows,
    ...(secondaryLabel && secondary > 0 ? { secondary: { label: secondaryLabel, count: secondary } } : {}),
  };
}

/**
 * 읽다가 실패한 자리. 표가 아직 없으면(마이그레이션 전) "준비 전"이고, 그 밖의 실패도
 * 0건으로 보여 주지 않는다.
 */
export function unavailableFrom(err: unknown): QueueCount {
  const msg = err instanceof Error ? err.message : String(err);
  const missingTable = /does not exist|relation .* not found|schema cache|PGRST205|42P01/i.test(msg);
  return { state: "unavailable", reason: missingTable ? "준비 전" : "읽지 못했어요" };
}

// ─── 다가오는 박람회와 준비 상태 ─────────────────────────────────────────

/** 다가오는 박람회 표가 레포 파일에서 쓰는 칸. 파일 읽기는 lib/intake/queue.ts(readRepoFiles)가 한다. */
export type UpcomingFile = Pick<RepoFile, "kind" | "path" | "slug" | "name" | "startDate" | "endDate" | "size">;

/** 운영에 있는 박람회 하나의 사실. */
export interface FairFacts {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  boothCount: number;
  /** 참가 사실(브랜드) 수. 브랜드 그래프를 못 읽었으면 null. */
  brandCount: number | null;
}

export type ReadinessStep = "floorplan" | "registered" | "brands" | "booths" | "brandsUnknown";

export const READINESS_NOTE: Record<ReadinessStep | "ready", string> = {
  floorplan: "배치도 대기",
  registered: "행사 등록 대기",
  brands: "브랜드 인입 대기",
  booths: "부스 인입 대기",
  brandsUnknown: "브랜드 확인 필요",
  ready: "준비됨",
};

export interface UpcomingFair {
  /** 운영에 있으면 id, 레포 파일에만 있으면 null. */
  id: string | null;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  daysUntil: number;
  registered: boolean;
  floorplan: boolean;
  /** 운영 참가 사실 수. 운영에 없으면 레포 brands.v1 파일의 수(fromFile). 모르면 null. */
  brands: { count: number; fromFile: boolean } | null;
  booths: number;
  /** 아직 안 된 첫 단계. 다 됐으면 "ready". */
  next: ReadinessStep | "ready";
  note: string;
}

/** YYYY-MM-DD 두 날짜 사이 날수. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * 앞으로 `windowDays`일 안에 시작하는 박람회(시작일이 오늘이거나 그 뒤).
 * 운영 행사에 더해, 레포 data/exhibitions에만 있는 행사(아직 안 만든 것)도 넣는다.
 *
 * 준비 순서는 docs/runbooks/sdf-2026-upload.md를 일반화했다. 배치도가 바깥 일정이라
 * 먼저 막히고(배치도 → 도면 등록), 그다음 행사 행, 브랜드, 부스 순이다.
 * 배치도는 코드의 FLOORPLANS 등록 여부로 본다.
 */
export function upcomingFairs(input: {
  fairs: FairFacts[];
  files: UpcomingFile[];
  floorplanSlugs: Set<string>;
  today: string;
  windowDays?: number;
}): UpcomingFair[] {
  const { fairs, files, floorplanSlugs, today } = input;
  const windowDays = input.windowDays ?? 60;
  const inWindow = (start: string) => start >= today && daysBetween(today, start) <= windowDays;
  const brandFile = new Map(files.filter((f) => f.kind === "brands").map((f) => [f.slug, f]));

  const rows: Omit<UpcomingFair, "next" | "note">[] = [];
  const seen = new Set<string>();
  for (const f of fairs) {
    if (!inWindow(f.startDate)) continue;
    seen.add(f.slug);
    rows.push({
      id: f.id,
      slug: f.slug,
      name: f.name,
      startDate: f.startDate,
      endDate: f.endDate,
      daysUntil: daysBetween(today, f.startDate),
      registered: true,
      floorplan: floorplanSlugs.has(f.slug),
      brands: f.brandCount === null ? null : { count: f.brandCount, fromFile: false },
      booths: f.boothCount,
    });
  }
  for (const file of files) {
    if (file.kind !== "exhibition" || seen.has(file.slug) || !file.startDate || !inWindow(file.startDate)) continue;
    seen.add(file.slug);
    const bf = brandFile.get(file.slug);
    rows.push({
      id: null,
      slug: file.slug,
      name: file.name ?? file.slug,
      startDate: file.startDate,
      endDate: file.endDate ?? file.startDate,
      daysUntil: daysBetween(today, file.startDate),
      registered: false,
      floorplan: floorplanSlugs.has(file.slug),
      brands: bf?.size !== undefined ? { count: bf.size, fromFile: true } : null,
      booths: 0,
    });
  }

  return rows
    .map((r) => {
      const next = readinessNext(r);
      return { ...r, next, note: READINESS_NOTE[next] };
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.name.localeCompare(b.name));
}

function readinessNext(r: Omit<UpcomingFair, "next" | "note">): ReadinessStep | "ready" {
  if (!r.floorplan) return "floorplan";
  if (!r.registered) return "registered";
  // 브랜드 그래프를 못 읽었으면(null) 모르는 것이라 막지 않는다.
  if (r.brands && r.brands.count === 0) return "brands";
  if (r.booths === 0) return "booths";
  // 다른 단계는 끝났어도 브랜드 수를 모르면 준비됐다고 말하지 않는다.
  if (!r.brands) return "brandsUnknown";
  return "ready";
}
