import { getRepository } from "@/lib/repositories";
import { getSessionId, ok } from "@/lib/api/http";

export async function GET() {
  const id = await getSessionId();
  if (!id) return ok({ session: null, preference: null });
  const repo = await getRepository();
  const session = await repo.getSession(id);
  const preference = session ? await repo.getPreference(id) : null;
  return ok({ session, preference });
}
