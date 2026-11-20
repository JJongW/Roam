// UI 14 마이페이지가 그리는 묶음을 만든다. 화면 코드와 떼어 두어 시험한다.
// 원천: 이 브라우저의 기록(stores/visit.ts, 로그인하면 계정 노트와 합친 것)과 박람회 목록.
import { dayKo, system } from "@/lib/copy/v1";

export interface MeFair {
  id: string;
  slug: string;
  name: string;
  venue: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate: string;
}

export type FairPhase = "ongoing" | "upcoming" | "ended";

export interface MeBoothRow {
  boothId: string;
  name: string;
  code?: string;
  category?: string;
  exhibitionId: string;
}

export interface FairGroup {
  fair: MeFair;
  phase: FairPhase;
  rows: MeBoothRow[];
}

/** lib/exhibition/status.ts의 exhibitionStatus와 같은 경계(시작일과 끝날 당일은 열림). */
export function phaseOf(f: Pick<MeFair, "startDate" | "endDate">, today: string): FairPhase {
  if (today < f.startDate) return "upcoming";
  if (today > f.endDate) return "ended";
  return "ongoing";
}

/** 시작일부터 끝날까지 며칠(양 끝 포함). */
export function fairDays(f: Pick<MeFair, "startDate" | "endDate">): number {
  const ms = Date.parse(f.endDate) - Date.parse(f.startDate);
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000) + 1) : 1;
}

const PHASE_ORDER: Record<FairPhase, number> = { ongoing: 0, upcoming: 1, ended: 2 };

/**
 * 부스 줄을 박람회별로 묶는다. 열린 박람회, 다가오는 박람회(가까운 순), 끝난 박람회(최근 순).
 * 박람회 목록에 없는 부스(목록에서 빠진 박람회)는 뺀다.
 */
export function groupByFair(rows: MeBoothRow[], fairs: MeFair[], today: string): FairGroup[] {
  const byId = new Map(fairs.map((f) => [f.id, f]));
  const map = new Map<string, MeBoothRow[]>();
  for (const r of rows) {
    if (!byId.has(r.exhibitionId)) continue;
    map.set(r.exhibitionId, [...(map.get(r.exhibitionId) ?? []), r]);
  }
  return [...map.entries()]
    .map(([id, rs]) => {
      const fair = byId.get(id)!;
      return {
        fair,
        phase: phaseOf(fair, today),
        rows: rs.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name)),
      };
    })
    .sort((a, b) => {
      const p = PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase];
      if (p) return p;
      return a.phase === "ended"
        ? b.fair.endDate.localeCompare(a.fair.endDate)
        : a.fair.startDate.localeCompare(b.fair.startDate);
    });
}

/** 다음 박람회: 지금 열린 곳이 먼저, 없으면 가장 가까운 다가오는 곳. */
export function nextFair(fairs: MeFair[], today: string): MeFair | null {
  const open = fairs
    .filter((f) => phaseOf(f, today) === "ongoing")
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  if (open[0]) return open[0];
  const soon = fairs
    .filter((f) => phaseOf(f, today) === "upcoming")
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  return soon[0] ?? null;
}

/** 묶음 머리 오른쪽 글: 다가오면 "12월 4일부터", 열려 있으면 "11월 23일까지", 끝났으면 "끝났어요". */
export function groupWhen(g: Pick<FairGroup, "fair" | "phase">): string {
  if (g.phase === "upcoming") return system.from(dayKo(g.fair.startDate));
  if (g.phase === "ongoing") return system.until(dayKo(g.fair.endDate));
  return "";
}

/**
 * 14-01, 14-03 로미 줄(사실 두 줄). 다음 박람회가 없으면 정해지면 나온다는 말만.
 * 둘째 줄: 그 박람회에 하트가 있으면 "하트 남긴 곳이 있어요.", 로그인 전이고 하트가 있으면 브라우저에만 있다는 사실.
 */
export function romiLine({
  next,
  today,
  heartsInNext,
  heartCount,
  signedIn,
}: {
  next: MeFair | null;
  today: string;
  heartsInNext: number;
  heartCount: number;
  signedIn: boolean;
}): string {
  if (heartCount === 0) {
    const open = next && phaseOf(next, today) === "ongoing" ? next : null;
    return open ? `${system.emptyHearts}\n${system.emptyHeartsOpen(open.name)}` : system.emptyHearts;
  }
  const first = !next
    ? system.noNextFair
    : phaseOf(next, today) === "ongoing"
      ? system.openNow(next.name)
      : system.nextFair(dayKo(next.startDate), next.name);
  const second = !signedIn
    ? system.myHeartsBrowserOnly
    : heartsInNext > 0
      ? system.myHeartsHere
      : "";
  return [first, second].filter(Boolean).join("\n");
}

/** "Google로 로그인했어요"에 쓸 이름. 닉네임만으로 들어온 계정은 없다(undefined). */
export function providerName(slug?: string): string | undefined {
  if (!slug) return undefined;
  const known: Record<string, string> = { google: "Google", apple: "Apple", kakao: "카카오", naver: "네이버" };
  return known[slug] ?? slug;
}

/** 닉네임 칸(15-03). Figma는 12자, 서버는 20자까지 받는다(lib/schemas loginSchema). 화면은 12자로 막는다. */
export const NICKNAME_MAX = 12;
const NICKNAME_RE = /^[\w가-힣][\w가-힣 ]*$/;
export function nicknameProblem(v: string): "invalid" | null {
  const t = v.trim();
  if (t.length < 2 || t.length > NICKNAME_MAX || !NICKNAME_RE.test(t)) return "invalid";
  return null;
}
