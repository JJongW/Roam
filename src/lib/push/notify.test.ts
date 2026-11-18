import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_TIMER_MS, scheduleReminder } from "./notify";

const shown: string[] = [];
class FakeNotification {
  static permission: NotificationPermission = "granted";
  constructor(title: string) {
    shown.push(title);
  }
}

describe("scheduleReminder", () => {
  beforeEach(() => {
    shown.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("Notification", FakeNotification);
    FakeNotification.permission = "granted";
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const now = 1_000_000_000_000;

  it("시작 10분 전에 울리고 그 전에는 울리지 않는다", () => {
    const at = now + 3 * 86_400_000; // 사흘 뒤(옛 24시간 상한이면 이틀 일찍 울렸다)
    vi.setSystemTime(now);
    expect(scheduleReminder("e", "b", at, 600_000, now)).toBe("scheduled");
    vi.advanceTimersByTime(at - 600_000 - now - 1);
    expect(shown).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(shown).toEqual(["e"]);
  });

  it("타이머가 지킬 수 없을 만큼 멀면 예약하지 않는다", () => {
    expect(
      scheduleReminder("e", "b", now + MAX_TIMER_MS + 600_001, 600_000, now),
    ).toBe("too-far");
    vi.runAllTimers();
    expect(shown).toEqual([]);
  });

  it("이미 시작했으면 예약하지 않는다", () => {
    expect(scheduleReminder("e", "b", now - 1, 600_000, now)).toBe("past");
    expect(shown).toEqual([]);
  });

  it("권한이 없으면 denied", () => {
    FakeNotification.permission = "default";
    expect(scheduleReminder("e", "b", now + 3_600_000, 600_000, now)).toBe(
      "denied",
    );
  });
});
