"use client";

import type { BoothEvent, CommunityPost, Waiting } from "@/lib/types";

type Unsubscribe = () => void;

const hasSupabaseClient =
  typeof process !== "undefined" &&
  Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

/**
 * Subscribe to live waiting updates for a booth.
 * - Supabase mode: postgres_changes on the `waiting` row.
 * - Mock mode: polls the waiting endpoint on an interval.
 * Returns an unsubscribe function.
 */
export function watchWaiting(
  boothId: string,
  onUpdate: (waiting: Waiting) => void,
  intervalMs = 12_000,
): Unsubscribe {
  if (hasSupabaseClient) {
    let channel: { unsubscribe: () => void } | null = null;
    import("@/lib/supabase/client")
      .then(({ createClient }) => {
        const supabase = createClient();
        channel = supabase
          .channel(`waiting:${boothId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "waiting",
              filter: `booth_id=eq.${boothId}`,
            },
            (payload: { new: Record<string, unknown> }) => {
              const r = payload.new;
              onUpdate({
                boothId: String(r.booth_id),
                enabled: Boolean(r.enabled),
                queueCount: Number(r.queue_count),
                estimatedMinutes: Number(r.estimated_minutes),
                updatedAt: String(r.updated_at),
              });
            },
          )
          .subscribe();
      })
      .catch(() => {});
    return () => channel?.unsubscribe();
  }

  // Mock fallback: poll.
  let active = true;
  const tick = async () => {
    try {
      const res = await fetch(`/api/booths/${boothId}/waiting`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (active && json?.data?.waiting) onUpdate(json.data.waiting);
    } catch {
      /* ignore */
    }
  };
  const id = setInterval(tick, intervalMs);
  return () => {
    active = false;
    clearInterval(id);
  };
}

/**
 * Subscribe to the live community feed for an exhibition.
 * - Supabase mode: postgres_changes on `community_post` triggers an immediate refetch.
 * - Mock mode: polls the community endpoint on an interval.
 */
export function watchPosts(
  slug: string,
  onUpdate: (posts: CommunityPost[]) => void,
  intervalMs = 8_000,
): Unsubscribe {
  let active = true;
  const refetch = async () => {
    try {
      const res = await fetch(`/api/exhibitions/${slug}/community`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (active && Array.isArray(json?.data))
        onUpdate(json.data as CommunityPost[]);
    } catch {
      /* ignore */
    }
  };

  if (hasSupabaseClient) {
    let channel: { unsubscribe: () => void } | null = null;
    refetch();
    import("@/lib/supabase/client")
      .then(({ createClient }) => {
        const supabase = createClient();
        channel = supabase
          .channel(`community:${slug}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "community_post" },
            () => refetch(),
          )
          .subscribe();
      })
      .catch(() => {});
    // Slow safety poll in case the socket drops.
    const id = setInterval(refetch, 30_000);
    return () => {
      active = false;
      clearInterval(id);
      channel?.unsubscribe();
    };
  }

  refetch();
  const id = setInterval(refetch, intervalMs);
  return () => {
    active = false;
    clearInterval(id);
  };
}

/** Subscribe to live event list for an exhibition (mock: poll). */
export function watchEvents(
  slug: string,
  onUpdate: (events: BoothEvent[]) => void,
  intervalMs = 20_000,
): Unsubscribe {
  let active = true;
  const tick = async () => {
    try {
      const res = await fetch(`/api/exhibitions/${slug}/events`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const json = await res.json();
      if (active && Array.isArray(json?.data)) onUpdate(json.data);
    } catch {
      /* ignore */
    }
  };
  const id = setInterval(tick, intervalMs);
  return () => {
    active = false;
    clearInterval(id);
  };
}
