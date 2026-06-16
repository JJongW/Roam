"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api/client";
import type { AnalyticsType } from "@/lib/types";

/** Fires a single analytics event on mount (e.g. booth view). Best-effort. */
export function AnalyticsTracker({
  type,
  boothId,
  x,
  y,
}: {
  type: AnalyticsType;
  boothId?: string;
  x?: number;
  y?: number;
}) {
  const sent = useRef(false);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    api.post("/api/analytics/events", { type, boothId, x, y }).catch(() => {});
  }, [type, boothId, x, y]);
  return null;
}
