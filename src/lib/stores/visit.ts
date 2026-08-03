"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api/client";
import type { BoothNote } from "@/lib/types";

/** A visitor's personal status for a booth, independent of the active route.
 *  네 가지 모두 서버 노트에 동기화된다(0029) — 폰을 바꿔도 지도 색이 따라온다. */
export type BoothStatus = "visited" | "skipped" | "interested" | "later";

export interface BoothRecord {
  status?: BoothStatus;
  /** '가봄'에 대한 뒤늦은 호불호 답 — 지도 시트의 "여기 어땠어?"에 답하면 채워진다.
   *  visited가 아닌 상태로 바뀌면 서버가 같이 지운다(setFromNotes가 그대로 반영). */
  retro?: "liked" | "disliked";
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
  /** Toggle a status; selecting the active status clears it. */
  toggleStatus: (boothId: string, status: BoothStatus) => void;
  setStatus: (boothId: string, status: BoothStatus | null) => void;
  setMemo: (boothId: string, memo: string) => void;
  setPhotos: (boothId: string, photos: string[]) => void;
  setRetro: (boothId: string, retro: "liked" | "disliked") => void;
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
        // 네 상태 그대로 보낸다. 예전엔 visited|skipped만 보내고 나머지는 null로
        // 깎았는데, 그게 끌림을 누를 때 서버의 '가봄'을 지우는 경로였다.
        status: r?.status ?? null,
        memo: r?.memo ?? "",
        photos: r?.photos ?? [],
      },
    );
    return res.taste;
  } catch {
    /* offline / not signed in — local cache still holds it */
    return null;
  }
}

/** '가봄' 부스의 되묻기 답을 서버에 저장. */
export async function pushRetro(
  boothId: string,
  liked: boolean,
): Promise<TasteUpdate | null> {
  try {
    const res = await api.post<{ note: BoothNote | null; taste: TasteUpdate }>(
      `/api/me/notes/${boothId}/retro`,
      { liked },
    );
    return res.taste;
  } catch {
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
  if (!merged.status && !merged.memo?.trim() && !merged.photos?.length) {
    const { [boothId]: _omit, ...rest } = records;
    return rest;
  }
  return { ...records, [boothId]: merged };
}

export const useVisitStore = create<VisitState>()(
  persist(
    (set) => ({
      records: {},
      toggleStatus: (boothId, status) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            status: s.records[boothId]?.status === status ? undefined : status,
          }),
        })),
      setStatus: (boothId, status) =>
        set((s) => ({
          // 상태가 바뀌면 이전 되묻기 답은 의미를 잃는다(끌림→나중에→가봄으로 옮겨
          // 다니면서 예전 '가봄' 시절 답이 새 상태에 들러붙어 있으면 안 된다).
          records: patch(s.records, boothId, {
            status: status ?? undefined,
            retro: undefined,
          }),
        })),
      setMemo: (boothId, memo) =>
        set((s) => ({ records: patch(s.records, boothId, { memo }) })),
      setPhotos: (boothId, photos) =>
        set((s) => ({ records: patch(s.records, boothId, { photos }) })),
      setRetro: (boothId, retro) =>
        set((s) => ({ records: patch(s.records, boothId, { retro }) })),
      setFromNotes: (notes) =>
        // 서버 노트를 로컬 위에 병합(교체 아님) — 로컬 전용 상태(끌림=interested,
        // 아직 미동기 기록)를 보존한다. 서버가 아는 부스는 서버 값이 위에 덮인다.
        // 교체하면 매 페이지 로드(AuthBootstrap refresh)마다 반응 색이 사라진다.
        set((s) => {
          const records: Record<string, BoothRecord> = { ...s.records };
          for (const n of notes) {
            if (n.status || n.memo?.trim() || n.photos?.length)
              records[n.boothId] = {
                ...records[n.boothId],
                status: n.status ?? records[n.boothId]?.status,
                retro: n.retro ?? records[n.boothId]?.retro,
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

/** Selector helpers for components that only need ids of a given status. */
export function idsByStatus(
  records: Record<string, BoothRecord>,
  status: BoothStatus,
): string[] {
  return Object.entries(records)
    .filter(([, r]) => r.status === status)
    .map(([id]) => id);
}
