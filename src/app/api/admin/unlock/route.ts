import { z } from "zod";
import { ok, fail, parseBody, setAdminCookie, withErrorBoundary } from "@/lib/api/http";
import { env } from "@/lib/env";

const bodySchema = z.object({ code: z.string().min(1) });

/** Organizer gate: exchange the secret code for an admin cookie. */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!env.ORGANIZER_CODE) return ok({ ok: true }); // gate disabled
    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    if (parsed.data.code !== env.ORGANIZER_CODE)
      return fail("FORBIDDEN", "코드가 올바르지 않아요");
    await setAdminCookie();
    return ok({ ok: true });
  });
}
