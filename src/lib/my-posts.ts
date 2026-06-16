"use client";

/**
 * Tracks which community posts were written on THIS device, so the UI can show
 * a delete affordance. The session cookie is httpOnly (unreadable from JS), so
 * we can't tell ownership client-side otherwise; the server still re-checks
 * session ownership on delete, this only drives what's offered.
 */
const KEY = "roam-my-posts";

export function getMyPostIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function addMyPostId(id: string): void {
  if (typeof window === "undefined") return;
  const ids = getMyPostIds();
  if (!ids.includes(id)) {
    ids.push(id);
    localStorage.setItem(KEY, JSON.stringify(ids.slice(-200)));
  }
}

export function removeMyPostId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    KEY,
    JSON.stringify(getMyPostIds().filter((x) => x !== id)),
  );
}
