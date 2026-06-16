import { getRepository } from "@/lib/repositories";
import { notFound, ok, parseBody } from "@/lib/api/http";
import { waitingInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const repo = await getRepository();
  const waiting = await repo.getWaiting(id);
  if (!waiting) return notFound("대기 정보가 없습니다");
  return ok({ waiting });
}

// operator updates queue — also broadcast via Realtime in Supabase mode.
export async function PUT(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, waitingInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const waiting = await repo.upsertWaiting(id, parsed.data);
  return ok({ waiting });
}
