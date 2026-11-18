"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api/client";
import type { BoothNote } from "@/lib/types";

/**
 * A visitor's personal record for a booth, independent of the active route.
 * interest·verdict 둘 다 서버 노트에 동기화된다 — 폰을 바꿔도 지도 색이 남는다.
 */
export type InterestValue = "must" | "curious" | "pass";
export type VerdictValue = "good" | "ok" | "bad";

export interface BoothRecord {
  interest?: InterestValue;
  verdict?: VerdictValue;
  /** Free-form personal note shown on the booth detail + map. */
  memo?: string;
  /** Personal photos (Cloudinary URLs) attached to this booth. */
  photos?: string[];
  /** 하트 하나(2026-11-07). v2 화면이 쓴다. 없으면 옛 interest로 읽는다(`isHearted`).
   *  서버 규칙(lib/notes/apply.ts)과 같이 interest도 맞춰 둬서 v1 화면 색이 어긋나지 않는다. */
  heart?: boolean;
  /** 다녀왔어요. 평가와 따로다(2026-11-17). 없으면 평가가 있는지로 읽는다(`isVisited`). */
  visited?: boolean;
  /** 다녀왔어요를 처음 누른 시각(ISO). "오후 2시 20분에 다녀왔어요"(6-05)와 "오늘 다녀온 곳"(6-04)이 읽는다.
   *  옛 기록이나 서버가 시각을 주지 않으면 비어 있고, 그때는 시각 줄 없이 "다녀왔어요"만 보인다. */
  visitedAt?: string;
}

/** 하트가 켜져 있는지 — 새 칸이 있으면 그것, 없으면 옛 interest(must, curious). */
export function isHearted(r: BoothRecord | undefined): boolean {
  if (!r) return false;
  if (r.heart !== undefined) return r.heart;
  return r.interest === "must" || r.interest === "curious";
}

/** 다녀왔어요가 켜져 있는지 — 새 칸이 있으면 그것, 없으면 평가가 있는지(평가는 다녀온 뒤에만 있다). */
export function isVisited(r: BoothRecord | undefined): boolean {
  if (!r) return false;
  if (r.visited !== undefined) return r.visited;
  return !!r.verdict;
}

/** 반응 쓰기 응답에 실려오는 취향 정확도 — 클라이언트는 이 값을 그대로 표시할 뿐
 *  자기 공식으로 계산하지 않는다(서버 유일 진실). */
export interface TasteUpdate {
  judgedCount: number;
  pct: number | null;
}

interface VisitState {
  records: Record<string, BoothRecord>;
  /** true면 로컬에 서버로 못 올라간 반응이 있다는 뜻 — pushNote 실패(비로그인·네트워크
   *  등) 때 켜지고, 소급 반영이 전부 성공하면 꺼진다. */
  hasPendingSync: boolean;
  setPendingSync: () => void;
  clearPendingSync: () => void;
  /** interest를 토글 — 같은 값을 다시 누르면 해제. */
  setInterest: (boothId: string, interest: InterestValue | null) => void;
  /** verdict를 토글 — 같은 값을 다시 누르면 해제. */
  setVerdict: (boothId: string, verdict: VerdictValue | null) => void;
  /** 하트를 켜고 끈다. 서버 규칙과 같게 interest도 맞춘다(켜면 must, 끄면 pass가 아니면 비움). */
  setHeart: (boothId: string, on: boolean) => void;
  /** 다녀왔어요를 켜고 끈다. 끄면 평가도 같이 지운다(2026-11-17, 서버와 같은 규칙). */
  setVisited: (boothId: string, on: boolean) => void;
  /** 되돌리기용 — 한 부스의 기록을 통째로 이전 값으로 돌린다. */
  restore: (boothId: string, record: BoothRecord | undefined) => void;
  setMemo: (boothId: string, memo: string) => void;
  setPhotos: (boothId: string, photos: string[]) => void;
  /** Replace the cache from the server (called after sign-in). */
  setFromNotes: (notes: BoothNote[]) => void;
  clear: () => void;
}

/**
 * Persist a single booth's record to the server. Caller must ensure the user
 * is signed in; the endpoint 401s otherwise (ignored here). 응답의 taste를
 * 돌려준다 — 호출부가 원하면 companion 스토어에 그대로 반영한다.
 *
 * `touched`는 "이 호출이 실제로 바꾸려는 필드"를 밝힌다 — interest/verdict는
 * 서버에서 undefined=안 건드림/null=해제/값=설정 세 가지로 갈리는데(repositories의
 * upsertNote 계약), 여기서 매번 둘 다 `?? null`로 보내면 memo만 고치는 쓰기조차
 * "verdict를 null로 바꿔라"로 읽혀 visited_at까지 지워진다(judgment-vocabulary
 * 최종 리뷰 Fix 1). 명시한 필드만 body에 넣고 나머지는 키 자체를 뺀다 — JSON.stringify가
 * undefined 값을 가진 키를 드롭하므로 서버는 "이 요청은 그 필드를 안 건드린다"로 읽는다.
 * 생략(undefined)이면 과거처럼 둘 다 보낸다 — 로컬 전용으로 쌓인 반응을 통째로
 * 소급 반영하는 배치 동기화(auth.ts의 syncPendingReactions)용 기본값이다.
 */
export async function pushNote(
  boothId: string,
  touched?: { interest?: boolean; verdict?: boolean; heart?: boolean; visited?: boolean },
): Promise<TasteUpdate | null> {
  const r = useVisitStore.getState().records[boothId];
  try {
    const body: Record<string, unknown> = {
      memo: r?.memo ?? "",
      photos: r?.photos ?? [],
    };
    if (!touched || touched.interest) body.interest = r?.interest ?? null;
    if (!touched || touched.verdict) body.verdict = r?.verdict ?? null;
    // 새 칸(PR #172). 하트를 보내면 서버가 interest보다 우선한다. 배치 동기화(touched 없음)는
    // 기기에 새 칸이 있을 때만 보낸다 — 옛 기록에 없는 값을 지어 보내지 않는다.
    if (touched ? touched.heart : r?.heart !== undefined) body.heart = isHearted(r);
    if (touched ? touched.visited : r?.visited !== undefined) body.visited = isVisited(r);
    const res = await api.put<{ note: BoothNote; taste: TasteUpdate }>(
      `/api/me/notes/${boothId}`,
      body,
    );
    return res.taste;
  } catch {
    /* offline / not signed in — local cache still holds it */
    useVisitStore.getState().setPendingSync();
    return null;
  }
}

function patch(
  records: Record<string, BoothRecord>,
  boothId: string,
  next: Partial<BoothRecord>,
): Record<string, BoothRecord> {
  const merged: BoothRecord = { ...records[boothId], ...next };
  // Drop empty records so the store stays compact.
  if (
    !merged.interest &&
    !merged.verdict &&
    !merged.heart &&
    !merged.visited &&
    !merged.memo?.trim() &&
    !merged.photos?.length
  ) {
    const { [boothId]: _omit, ...rest } = records;
    return rest;
  }
  return { ...records, [boothId]: merged };
}

export const useVisitStore = create<VisitState>()(
  persist(
    (set) => ({
      records: {},
      hasPendingSync: false,
      setPendingSync: () => set({ hasPendingSync: true }),
      clearPendingSync: () => set({ hasPendingSync: false }),
      setInterest: (boothId, interest) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            interest:
              s.records[boothId]?.interest === interest
                ? undefined
                : (interest ?? undefined),
            // 옛 화면이 interest를 고치면 하트 칸을 비워 interest에서 다시 읽게 한다.
            heart: undefined,
          }),
        })),
      setVerdict: (boothId, verdict) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            verdict:
              s.records[boothId]?.verdict === verdict
                ? undefined
                : (verdict ?? undefined),
            // 평가를 남기면 다녀온 것이다. 평가를 지워도 다녀왔어요는 남긴다(서버와 같은 규칙).
            visited:
              isVisited(s.records[boothId]) ||
              (s.records[boothId]?.verdict !== verdict && !!verdict),
            visitedAt:
              s.records[boothId]?.visitedAt ??
              (s.records[boothId]?.verdict !== verdict && !!verdict ? new Date().toISOString() : undefined),
          }),
        })),
      setHeart: (boothId, on) =>
        set((s) => {
          const prev = s.records[boothId];
          const interest: InterestValue | undefined = on
            ? prev?.interest === "must" || prev?.interest === "curious"
              ? prev.interest
              : "must"
            : prev?.interest === "pass"
              ? "pass"
              : undefined;
          return { records: patch(s.records, boothId, { heart: on, interest }) };
        }),
      setVisited: (boothId, on) =>
        set((s) => ({
          records: patch(
            s.records,
            boothId,
            on
              ? { visited: true, visitedAt: s.records[boothId]?.visitedAt ?? new Date().toISOString() }
              : { visited: false, verdict: undefined, visitedAt: undefined },
          ),
        })),
      restore: (boothId, record) =>
        set((s) => {
          if (!record) {
            const rest = { ...s.records };
            delete rest[boothId];
            return { records: rest };
          }
          return { records: { ...s.records, [boothId]: record } };
        }),
      setMemo: (boothId, memo) =>
        set((s) => ({ records: patch(s.records, boothId, { memo }) })),
      setPhotos: (boothId, photos) =>
        set((s) => ({ records: patch(s.records, boothId, { photos }) })),
      setFromNotes: (notes) =>
        // 서버 노트를 로컬 위에 병합(교체 아님) — 로컬 전용 상태(아직 미동기 기록)를
        // 보존한다. 서버가 아는 부스는 서버 값이 위에 덮인다.
        set((s) => {
          const records: Record<string, BoothRecord> = { ...s.records };
          for (const n of notes) {
            if (
              n.interest ||
              n.verdict ||
              n.heart ||
              n.visited ||
              n.memo?.trim() ||
              n.photos?.length
            )
              records[n.boothId] = {
                ...records[n.boothId],
                interest: n.interest ?? records[n.boothId]?.interest,
                verdict: n.verdict ?? records[n.boothId]?.verdict,
                // 서버가 새 칸을 주면 그대로 받는다(옛 서버 응답엔 없어서 undefined로 남는다).
                heart: n.heart ?? records[n.boothId]?.heart,
                visited: n.visited ?? records[n.boothId]?.visited,
                visitedAt: n.visitedAt ?? records[n.boothId]?.visitedAt,
                memo: n.memo,
                photos: n.photos,
              };
          }
          return { records };
        }),
      clear: () => set({ records: {} }),
    }),
    { name: "roam-visit", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Selector helpers — 특정 interest/verdict 값을 가진 부스 id 목록. */
export function idsByInterest(
  records: Record<string, BoothRecord>,
  interest: InterestValue,
): string[] {
  return Object.entries(records)
    .filter(([, r]) => r.interest === interest)
    .map(([id]) => id);
}

export function idsByVerdict(
  records: Record<string, BoothRecord>,
  verdict: VerdictValue,
): string[] {
  return Object.entries(records)
    .filter(([, r]) => r.verdict === verdict)
    .map(([id]) => id);
}
