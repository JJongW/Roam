"use client";

/**
 * 브라우저 알림(Notification API)으로 이 탭 안에서만 울리는 이벤트 알림.
 *
 * 서버가 보내는 푸시가 아니다. 탭을 닫거나 브라우저를 끄면 울리지 않는다. 그래서 화면 문구도
 * "이 창을 열어 두시면"이라고만 약속한다(2026-11-18 브랜드 검토).
 *
 * TODO(web-push): 진짜 웹 푸시는 서비스 워커 + PushManager.subscribe(VAPID)로 받은 구독을
 * 서버에 저장하고, 서버가 시작 10분 전에 보내야 한다. 그 전에는 가짜 토큰을 서버에 올리지 않는다
 * (예전 `web_${uid}` 토큰은 구독이 아니어서 서버가 보낼 곳이 없었다).
 */

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

/** setTimeout이 지킬 수 있는 가장 긴 지연(2^31-1ms, 약 24.8일). 넘기면 바로 울린다. */
export const MAX_TIMER_MS = 2_147_483_647;

export type ReminderResult =
  "scheduled" | "unsupported" | "denied" | "too-far" | "past";

/**
 * 시작 `leadMs` 전에 이 탭에서 알림을 띄운다. 지킬 수 없는 예약은 하지 않는다.
 * - 이미 시작했으면 "past"(예약 안 함).
 * - 울릴 때까지가 타이머 한계보다 길면 "too-far"(일찍 울리지 않게 예약 안 함).
 * - 시작까지 `leadMs`보다 덜 남았으면 바로 한 번 알린다(곧 시작하는 게 사실이다).
 */
export function scheduleReminder(
  title: string,
  body: string,
  atMs: number,
  leadMs = 10 * 60_000,
  now = Date.now(),
): ReminderResult {
  if (!isNotificationSupported()) return "unsupported";
  if (Notification.permission !== "granted") return "denied";
  if (atMs <= now) return "past";
  const delay = atMs - leadMs - now;
  if (delay > MAX_TIMER_MS) return "too-far";
  const show = () =>
    new Notification(title, { body, icon: "/icon-192.png", tag: title });
  if (delay <= 0) show();
  else setTimeout(show, delay);
  return "scheduled";
}
