"use client";

import { useEffect, useState } from "react";
import { watchWaiting } from "@/lib/realtime";
import type { Waiting } from "@/lib/types";

export function useLiveWaiting(boothId: string, initial?: Waiting | null) {
  const [waiting, setWaiting] = useState<Waiting | null>(initial ?? null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const unsub = watchWaiting(boothId, (w) => {
      setWaiting(w);
      setLive(true);
    });
    return unsub;
  }, [boothId]);

  return { waiting, live };
}
