import { describe, expect, it } from "vitest";
import { uiClickBreakdown } from "./ui-click-breakdown";
import type { AnalyticsEvent } from "@/lib/types";

function ev(control: string, type: AnalyticsEvent["type"] = "ui_click"): AnalyticsEvent {
  return {
    id: `an_${Math.random()}`,
    sessionId: "s1",
    exhibitionId: "exh_1",
    type,
    createdAt: "2026-08-13T00:00:00.000Z",
    meta: { control },
  } as AnalyticsEvent;
}

describe("uiClickBreakdown", () => {
  it("counts by control, descending, ignoring non-ui_click events", () => {
    const events = [
      ev("map_zoom_in"),
      ev("map_zoom_in"),
      ev("companion_bar_open"),
      ev("map_zoom_in"),
      ev("view", "view"),
    ];
    const result = uiClickBreakdown(events);
    expect(result).toEqual([
      { control: "map_zoom_in", count: 3 },
      { control: "companion_bar_open", count: 1 },
    ]);
  });

  it("returns an empty array when there are no ui_click events", () => {
    expect(uiClickBreakdown([ev("view", "view")])).toEqual([]);
  });

  it("ignores ui_click events with no meta.control", () => {
    const noControl: AnalyticsEvent = {
      id: "an_x",
      sessionId: "s1",
      exhibitionId: "exh_1",
      type: "ui_click",
      createdAt: "2026-08-13T00:00:00.000Z",
    } as AnalyticsEvent;
    expect(uiClickBreakdown([noControl])).toEqual([]);
  });
});
