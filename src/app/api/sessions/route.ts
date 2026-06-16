import { getRepository } from "@/lib/repositories";
import { created, parseBody, setSessionCookie } from "@/lib/api/http";
import { createSessionSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const parsed = await parseBody(req, createSessionSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const session = await repo.createSession(parsed.data.exhibitionId);
  await setSessionCookie(session.id);
  return created({ session });
}
