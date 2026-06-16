import { getRepository } from "@/lib/repositories";
import { created, ok, parseBody } from "@/lib/api/http";
import { exhibitionInputSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const page = await repo.listExhibitions({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });
  return ok(page);
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, exhibitionInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const exhibition = await repo.createExhibition(parsed.data);
  return created({ exhibition });
}
