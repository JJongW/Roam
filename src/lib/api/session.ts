import { getRepository } from "@/lib/repositories";
import { getSessionId, getUserId, setSessionCookie } from "@/lib/api/http";
import type { User, VisitorSession } from "@/lib/types";

/**
 * Returns the current anonymous session, creating one (and setting the cookie)
 * if none exists. `exhibitionId` ties a freshly created session to an exhibition.
 */
export async function ensureSession(
  exhibitionId = "unknown",
): Promise<VisitorSession> {
  const repo = await getRepository();
  const id = await getSessionId();
  if (id) {
    const existing = await repo.getSession(id);
    if (existing) return existing;
  }
  const session = await repo.createSession(exhibitionId);
  await setSessionCookie(session.id);
  return session;
}

/** Returns the signed-in user (nickname account) or null if not logged in. */
export async function getCurrentUser(): Promise<User | null> {
  const id = await getUserId();
  if (!id) return null;
  const repo = await getRepository();
  return repo.getUser(id);
}
