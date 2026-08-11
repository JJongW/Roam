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
 */
export async function pushNote(boothId: string): Promise<TasteUpdate | null> {
  const r = useVisitStore.getState().records[boothId];
  try {
    const res = await api.put<{ note: BoothNote; taste: TasteUpdate }>(
      `/api/me/notes/${boothId}`,
      {
        interest: r?.interest ?? null,
        verdict: r?.verdict ?? null,
        memo: r?.memo ?? "",
        photos: r?.photos ?? [],
      },
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
            interest: s.records[boothId]?.interest === interest ? undefined : (interest ?? undefined),
          }),
        })),
      setVerdict: (boothId, verdict) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            verdict: s.records[boothId]?.verdict === verdict ? undefined : (verdict ?? undefined),
          }),
        })),
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
            if (n.interest || n.verdict || n.memo?.trim() || n.photos?.length)
              records[n.boothId] = {
                ...records[n.boothId],
                interest: n.interest ?? records[n.boothId]?.interest,
                verdict: n.verdict ?? records[n.boothId]?.verdict,
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
