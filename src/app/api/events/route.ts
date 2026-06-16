import { getRepository } from "@/lib/repositories";
import { created, parseBody } from "@/lib/api/http";
import { eventInputSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const parsed = await parseBody(req, eventInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const event = await repo.createEvent(parsed.data);
  return created({ event });
}
