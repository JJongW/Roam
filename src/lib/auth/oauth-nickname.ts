import type { Repository } from "@/lib/repositories/types";

/**
 * Derive a nickname for an OAuth account from the provider's display name or
 * email, conforming to `loginSchema` (2–20 chars, `^[\w가-힣][\w가-힣 ]*$`),
 * then make it unique by probing the repo and appending a numeric suffix.
 *
 * Nickname stays the app's public key even for OAuth users, so it must be
 * unique and valid — but the provider's raw name may contain emoji, dots, or
 * be missing entirely, so we sanitize and always have a fallback.
 */

const FALLBACK = "게스트";

/** Strip characters the nickname regex rejects; collapse spaces; trim ends. */
function sanitize(raw: string): string {
  return raw
    .replace(/[^\w가-힣 ]/g, "") // drop disallowed (emoji, dots, @, …)
    .replace(/\s+/g, " ")
    .trim();
}

/** A valid 2–20 char base nickname derived from name → email local part. */
export function baseNickname(input: {
  name?: string | null;
  email?: string | null;
}): string {
  const fromName = sanitize(input.name ?? "");
  const fromEmail = sanitize((input.email ?? "").split("@")[0] ?? "");
  let base = fromName || fromEmail || FALLBACK;
  if (base.length < 2) base = FALLBACK;
  // Reserve room for a possible "-12" style suffix within the 20-char cap.
  return base.slice(0, 20);
}

/**
 * Return a nickname not currently taken. Tries the base, then base + counter.
 * `getUserByNickname` is case-insensitive, matching the DB's unique index.
 */
export async function uniqueNickname(
  repo: Repository,
  input: { name?: string | null; email?: string | null },
): Promise<string> {
  const base = baseNickname(input);
  if (!(await repo.getUserByNickname(base))) return base;

  for (let i = 2; i < 10_000; i++) {
    const suffix = ` ${i}`;
    const candidate = base.slice(0, 20 - suffix.length) + suffix;
    if (!(await repo.getUserByNickname(candidate))) return candidate;
  }
  // Astronomically unlikely; fall back to a random tail.
  return `${FALLBACK} ${Math.random().toString(36).slice(2, 7)}`;
}
