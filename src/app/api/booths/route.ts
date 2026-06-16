import { getRepository } from "@/lib/repositories";
import { created, parseBody } from "@/lib/api/http";
import { boothInputSchema } from "@/lib/schemas";

export async function POST(req: Request) {
  const parsed = await parseBody(req, boothInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const booth = await repo.createBooth(parsed.data);
  return created({ booth });
}
