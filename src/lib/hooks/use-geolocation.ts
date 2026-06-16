"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface GeoState {
  supported: boolean;
  tracking: boolean;
  coords: { lat: number; lng: number; accuracy: number } | null;
  error: string | null;
}

/**
 * Thin wrapper over the Geolocation API. Indoors GPS is unreliable, so the
 * navigation UI uses this only as an optional signal and falls back to manual
 * map-tap positioning. Exposed to satisfy "position tracking".
 */
export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    supported: typeof navigator !== "undefined" && "geolocation" in navigator,
    tracking: false,
    coords: null,
    error: null,
  });
  const watchId = useRef<number | null>(null);

  const start = useCallback(() => {
    if (!state.supported || watchId.current != null) return;
    setState((s) => ({ ...s, tracking: true, error: null }));
    watchId.current = navigator.geolocation.watchPosition(
      (pos) =>
        setState((s) => ({
          ...s,
          coords: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        })),
      (err) => setState((s) => ({ ...s, tracking: false, error: err.message })),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
  }, [state.supported]);

  const stop = useCallback(() => {
    if (watchId.current != null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setState((s) => ({ ...s, tracking: false }));
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { ...state, start, stop };
}
