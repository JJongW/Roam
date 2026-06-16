"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Reports Core Web Vitals. In production this would POST to a monitoring sink
 * (e.g. /api/monitoring/vitals or a 3rd-party). Here it logs in dev.
 */
export function WebVitals() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[web-vital] ${metric.name}: ${Math.round(metric.value)}`);
    }
    // navigator.sendBeacon?.("/api/monitoring/vitals", JSON.stringify(metric));
  });
  return null;
}
