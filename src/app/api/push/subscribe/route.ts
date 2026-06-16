import { created, parseBody } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { pushSubscribeSchema } from "@/lib/schemas";

// Stores a push token for the session. In Supabase mode this would persist to a
// push_token table; here it acknowledges so the client flow is exercisable.
export async function POST(req: Request) {
  const parsed = await parseBody(req, pushSubscribeSchema);
  if (!parsed.ok) return parsed.res;
  const session = await ensureSession();
  return created({ sessionId: session.id, token: parsed.data.token });
}
