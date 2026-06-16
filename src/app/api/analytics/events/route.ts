import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repositories";
import { parseBody } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { analyticsEventInputSchema } from "@/lib/schemas";

// Fire-and-forget visitor analytics ingestion.
export async function POST(req: Request) {
  const parsed = await parseBody(req, analyticsEventInputSchema);
  if (!parsed.ok) return parsed.res;
  const session = await ensureSession();
  const repo = await getRepository();
  await repo.recordAnalytics(session.id, session.exhibitionId, parsed.data);
  return new NextResponse(null, { status: 202 });
}
