"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth";
import type { BoothDetail, NoteWithContext } from "@/lib/types";

export interface BoothMeta {
  name: string;
  code?: string;
  /** 분류 이름(14-02, 14-07 줄 둘째 줄). 부스 상세를 부른 것에만 있다. */
  category?: string;
  exhibitionId: string;
}

/**
 * 기록만 있는 부스 id들의 이름과 번호를 불러온다(다녀온 기록 6-10, 마이페이지 14).
 * - 로그인했으면 GET /api/me/notes?expand=booth 한 번(API A-1, PR #172). 분류가 필요하면(withCategory) 건너뛴다.
 * - 거기 없는 것(아직 올라가지 않은 기기 기록)과 로그인 전에는 부스마다 GET /api/booths/{id}를 6개씩 묶어 부른다.
 * - 못 불러온 부스는 null(목록에서 뺀다).
 * 돌려주는 맵에 id가 아직 없으면 불러오는 중이다.
 */
export function useBoothMeta(
  ids: string[],
  { withCategory = false }: { withCategory?: boolean } = {},
): Record<string, BoothMeta | null> {
  const authReady = useAuthStore((s) => s.ready);
  const signedIn = useAuthStore((s) => !!s.user);
  const idsKey = ids.slice().sort().join(",");
  const [meta, setMeta] = useState<Record<string, BoothMeta | null>>({});

  useEffect(() => {
    if (!idsKey || !authReady) return;
    let alive = true;
    (async () => {
      const out: Record<string, BoothMeta | null> = {};
      if (signedIn && !withCategory) {
        const notes = await api
          .get<{ data: NoteWithContext[] }>("/api/me/notes?expand=booth")
          .then((r) => r.data)
          .catch(() => [] as NoteWithContext[]);
        for (const n of notes) {
          if (n.booth && n.exhibition)
            out[n.boothId] = {
              name: n.booth.name,
              code: n.booth.code,
              exhibitionId: n.exhibition.id,
            };
        }
      }
      const missing = idsKey.split(",").filter((id) => !(id in out));
      for (let i = 0; i < missing.length; i += 6) {
        await Promise.all(
          missing.slice(i, i + 6).map(async (id) => {
            const d = await api.get<BoothDetail>(`/api/booths/${id}`).catch(() => null);
            out[id] = d
              ? {
                  name: d.booth.name,
                  code: d.booth.code,
                  category: d.category?.name,
                  exhibitionId: d.booth.exhibitionId,
                }
              : null;
          }),
        );
      }
      if (alive) setMeta(out);
    })();
    return () => {
      alive = false;
    };
  }, [idsKey, authReady, signedIn, withCategory]);

  return meta;
}
