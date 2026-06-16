"use client";

import { useEffect, useState } from "react";

/**
 * Returns false during SSR + the first client render, true afterwards.
 * Use to gate UI driven by persisted (localStorage/sessionStorage) stores so
 * the server-rendered markup matches the first client paint (no hydration warning).
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
