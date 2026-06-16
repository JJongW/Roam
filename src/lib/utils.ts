import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, format, isAfter } from "date-fns";
import { ko } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Human time for community posts. Relative time ("3분 전") only makes sense for
 * the past — before an exhibition opens, seed/scheduled posts carry a future
 * timestamp, so showing "8일 후" reads as broken. For future times we show the
 * absolute date with a "예정" tag instead.
 */
export function formatPostTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (isAfter(d, now)) return `${format(d, "M/d", { locale: ko })} 예정`;
  return formatDistanceToNow(d, { addSuffix: true, locale: ko });
}

/** Stable id without external deps (mock + client temp ids). */
export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Short, URL-friendly code for shareable links (e.g. /r/ab12cd). */
export function shortId(len = 7): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789"; // no ambiguous chars
  let out = "";
  for (let i = 0; i < len; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}분`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

/** Short walking duration: seconds under a minute (e.g. "10초", "2분"). */
export function formatWalk(min: number): string {
  if (min < 1) {
    const s = Math.max(10, Math.round((min * 60) / 5) * 5); // round to 5s, min 10s
    if (s >= 60) return "1분";
    return `${s}초`;
  }
  return `${Math.round(min)}분`;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
