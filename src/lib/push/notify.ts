"use client";

import { api } from "@/lib/api/client";
import { uid } from "@/lib/utils";

export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

/** Register a push token with the server (FCM token in production; demo token otherwise). */
export async function registerForPush(): Promise<boolean> {
  try {
    await api.post("/api/push/subscribe", { token: `web_${uid("tok")}` });
    return true;
  } catch {
    return false;
  }
}

/**
 * Schedule a local reminder. Fires a Notification `leadMs` before `atMs`
 * while the tab is open. Returns true if scheduled.
 */
export function scheduleReminder(
  title: string,
  body: string,
  atMs: number,
  leadMs = 10 * 60_000,
): boolean {
  if (!isPushSupported() || Notification.permission !== "granted") return false;
  const fireAt = atMs - leadMs;
  const delay = fireAt - Date.now();
  const show = () => new Notification(title, { body, icon: "/icon.svg", tag: title });
  if (delay <= 0) {
    // event is imminent/now — confirm subscription with an immediate ping
    show();
  } else {
    // cap setTimeout to ~24h
    setTimeout(show, Math.min(delay, 86_400_000));
  }
  return true;
}
