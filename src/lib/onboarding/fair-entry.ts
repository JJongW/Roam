// UI 1 박람회 첫 진입(취향 확장형, 11-12 Figma 24). iOS `FairOnboarding.swift`와 같은 규칙, 같은 저장 키.
//
// - 박람회를 처음 열면 지도 위로 사진 고르기 시트(1-02). 그 박람회 부스 사진 여섯 장 중 두 장.
//   건너뛰면 바로 지도. 사진이 여섯 장이 안 되면 시트를 띄우지 않는다.
// - 두 장을 고르면 지도로 돌아와 "지금 행사장에 계세요?"(1-04) 한 번.
// - 이어서 고른 사진의 부스와 같은 분류 부스로 세 곳(1-05). 이유를 그대로 말한다.
//   "이건 아니에요"는 온보딩 답으로만 남기고 패스로 기록하지 않는다.
// - 두 번째 진입: 건너뛴 분께 한 번만 다시 묻는다(1-10, 11-13 B). 하트가 있으면 1-09.
// - 온보딩으로 사람을 다 알 수는 없다. 고른 것만 기억하고(1-07), 둘러본 시간이나 길로 짐작하지 않는다.
//
// 저장: 이 브라우저 localStorage `roam.fair.<slug>`에 JSON. 로그아웃해도 남는다(기기 기록).
import type { BoothListItem } from "@/lib/types";

export interface FairOnboardingState {
  moodBoothIds: string[];
  moodSkipped: boolean;
  /** 1-10 다시 묻기를 이미 보였는지(한 번만). */
  reaskShown: boolean;
  /** 1-04 답. 없으면 아직 안 물었거나 넘김. */
  onSite?: boolean;
  onsiteAsked: boolean;
  /** 1-05 세 곳을 이미 보였는지. */
  firstPicksShown: boolean;
  /** "이건 아니에요" — 온보딩 답일 뿐, 부스 평가(패스)가 아니다. */
  notThis: string[];
  /** 마지막으로 연 날(YYYY-MM-DD). */
  lastOpenedDay?: string;
  openCount: number;
}

export const EMPTY_STATE: FairOnboardingState = {
  moodBoothIds: [],
  moodSkipped: false,
  reaskShown: false,
  onsiteAsked: false,
  firstPicksShown: false,
  notThis: [],
  openCount: 0,
};

const key = (slug: string) => `roam.fair.${slug}`;

export function readFairState(slug: string): FairOnboardingState {
  try {
    const raw = window.localStorage.getItem(key(slug));
    if (!raw) return { ...EMPTY_STATE };
    return { ...EMPTY_STATE, ...(JSON.parse(raw) as Partial<FairOnboardingState>) };
  } catch {
    return { ...EMPTY_STATE };
  }
}

export function updateFairState(
  slug: string,
  change: (s: FairOnboardingState) => FairOnboardingState,
): FairOnboardingState {
  const next = change(readFairState(slug));
  try {
    window.localStorage.setItem(key(slug), JSON.stringify(next));
  } catch {
    // 남기지 못하면 다음에 처음처럼 한 번 더 물을 뿐이다.
  }
  return next;
}

export type FairEntryStep = "mood" | "returnWithHearts" | "reask" | "none";

export const MOOD_PHOTO_COUNT = 6;
export const MOOD_PICK_COUNT = 2;

/**
 * 박람회를 열 때 무엇을 먼저 보일지(iOS `FairEntry.step`).
 * @param state 이번 열기를 세기 전 상태
 */
export function entryStep(
  state: FairOnboardingState,
  { photoCount, heartsHere, today }: { photoCount: number; heartsHere: number; today: string },
): FairEntryStep {
  const canPick = photoCount >= MOOD_PHOTO_COUNT;
  if (state.openCount === 0) return canPick ? "mood" : "none";
  if (state.lastOpenedDay === today) return "none";
  if (heartsHere > 0) return "returnWithHearts";
  if (state.moodSkipped && !state.reaskShown && canPick) return "reask";
  return "none";
}

type PhotoBooth = Pick<BoothListItem, "id" | "categoryId" | "images" | "kind">;

/** 사진 여섯 장: 분류가 겹치지 않게 돌아가며 고른다. 같은 박람회면 늘 같은 순서. */
export function moodBooths<T extends PhotoBooth>(booths: T[]): T[] {
  const withPhoto = booths
    .filter((b) => b.kind !== "facility" && b.images.some((s) => !!s))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const byCat = new Map<string, T[]>();
  for (const b of withPhoto) byCat.set(b.categoryId, [...(byCat.get(b.categoryId) ?? []), b]);
  const out: T[] = [];
  for (let round = 0; out.length < MOOD_PHOTO_COUNT; round++) {
    let added = false;
    for (const list of byCat.values()) {
      if (round < list.length && out.length < MOOD_PHOTO_COUNT) {
        out.push(list[round]);
        added = true;
      }
    }
    if (!added) break;
  }
  return out;
}

export interface FirstPick {
  boothId: string;
  reason: string;
}

export const reasonPhoto = "고르신 사진의 부스예요.";
export const reasonCategory = (name: string) => `고르신 사진의 부스와 같은 ${name} 분류예요.`;

/** 1-05 세 곳: 고른 사진의 부스 두 곳 + 그 분류의 다른 부스 한 곳. 하트를 이미 남긴 곳과 "이건 아니에요"는 뺀다. */
export function firstPicks(
  picked: string[],
  booths: Pick<BoothListItem, "id" | "categoryId" | "kind">[],
  categoryName: (id: string) => string | undefined,
  hearted: Set<string>,
  notThis: Set<string>,
): FirstPick[] {
  const skip = new Set([...hearted, ...notThis]);
  const out: FirstPick[] = picked.filter((id) => !skip.has(id)).map((boothId) => ({ boothId, reason: reasonPhoto }));
  const sorted = [...booths]
    .filter((b) => b.kind !== "facility")
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const cats = picked.map((id) => booths.find((b) => b.id === id)?.categoryId).filter((c): c is string => !!c);
  for (const cat of cats) {
    if (out.length >= 3) break;
    const other = sorted.find(
      (b) =>
        b.categoryId === cat &&
        !picked.includes(b.id) &&
        !skip.has(b.id) &&
        !out.some((p) => p.boothId === b.id),
    );
    if (other) {
      const name = categoryName(cat);
      out.push({ boothId: other.id, reason: name ? reasonCategory(name) : reasonPhoto });
    }
  }
  return out.slice(0, 3);
}

/**
 * UI 8-04 로미가 고른 곳(K-C, 목록에만). iOS `FairEntry.morePicks`와 같은 규칙.
 * 고른 사진의 부스 먼저, 그다음 그 분류의 다른 부스를 분류마다 돌아가며. 이유는 확인된 것만 말한다
 * ("고르신 사진의 부스예요", "고르신 사진의 부스와 같은 문구 분류예요"). 하트 남긴 곳과 "이건 아니에요"는 뺀다.
 * 사진을 고르지 않았으면 빈 목록이다(설계서 8-04 "건너뛰었으면 R-2와 지도에 켜기 없음").
 */
export function morePicks(
  picked: string[],
  booths: { id: string; categoryId?: string; kind?: string }[],
  categoryName: (id: string) => string | undefined,
  hearted: Set<string>,
  notThis: Set<string>,
  limit = 10,
): FirstPick[] {
  if (!picked.length) return [];
  const skip = new Set([...hearted, ...notThis]);
  const pool = booths.filter((b) => b.kind !== "facility");
  const out: FirstPick[] = picked
    .filter((id) => !skip.has(id) && pool.some((b) => b.id === id))
    .map((boothId) => ({ boothId, reason: reasonPhoto }));
  const cats = picked
    .map((id) => pool.find((b) => b.id === id)?.categoryId)
    .filter((c): c is string => !!c);
  const sorted = [...pool].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  while (out.length < limit) {
    let added = false;
    for (const cat of cats) {
      if (out.length >= limit) break;
      const next = sorted.find(
        (b) =>
          b.categoryId === cat &&
          !picked.includes(b.id) &&
          !skip.has(b.id) &&
          !out.some((p) => p.boothId === b.id),
      );
      if (next) {
        const name = categoryName(cat);
        out.push({ boothId: next.id, reason: name ? reasonCategory(name) : reasonPhoto });
        added = true;
      }
    }
    if (!added) break;
  }
  return out.slice(0, limit);
}

/** 8-07 고른 곳을 지도에 켰는지. 오늘만 켜 둔다(다음 날 열면 꺼져 있다). iOS와 같은 키 `roam.picksOnMap.<slug>`. */
const picksKey = (slug: string) => `roam.picksOnMap.${slug}`;

export function readPicksOnMap(slug: string, today: string): boolean {
  try {
    return window.localStorage.getItem(picksKey(slug)) === today;
  } catch {
    return false;
  }
}

export function writePicksOnMap(slug: string, on: boolean, today: string) {
  try {
    if (on) window.localStorage.setItem(picksKey(slug), today);
    else window.localStorage.removeItem(picksKey(slug));
  } catch {
    // 남기지 못하면 다음 열기에 꺼진 채로 시작할 뿐이다.
  }
}

/**
 * UI 24 Q2A-2 미리보기 시트의 "자세히 보기"로 상세에 갔다가 뒤로 오면 같은 시트로(Figma Q2 A 노트 "뒤로 가면 시트로").
 * 지도 화면은 상세로 가면 내려가므로 첫 세 곳 진행(목록, 위치, 머리 줄)을 이 탭에만 잠깐 남긴다(sessionStorage).
 * 다음에 지도가 뜰 때 한 번 읽고 지운다. 다른 탭이나 다음 날로 넘어가지 않는다.
 */
export interface FirstPicksResume {
  picks: FirstPick[];
  index: number;
  head: string;
}

const resumeKey = (slug: string) => `roam.firstPicksResume.${slug}`;

export function saveFirstPicksResume(slug: string, r: FirstPicksResume) {
  try {
    window.sessionStorage.setItem(resumeKey(slug), JSON.stringify(r));
  } catch {
    // 남기지 못하면 돌아왔을 때 시트 없이 지도일 뿐이다.
  }
}

/** 남긴 진행을 읽고 지운다. 모양이 맞지 않으면 없는 것으로 본다. */
export function takeFirstPicksResume(slug: string): FirstPicksResume | null {
  try {
    const raw = window.sessionStorage.getItem(resumeKey(slug));
    if (!raw) return null;
    window.sessionStorage.removeItem(resumeKey(slug));
    const r = JSON.parse(raw) as Partial<FirstPicksResume>;
    if (
      !Array.isArray(r.picks) ||
      !r.picks.length ||
      !r.picks.every((p) => typeof p?.boothId === "string" && typeof p?.reason === "string") ||
      typeof r.index !== "number" ||
      r.index < 0 ||
      r.index >= r.picks.length ||
      typeof r.head !== "string"
    )
      return null;
    return { picks: r.picks, index: r.index, head: r.head };
  } catch {
    return null;
  }
}
