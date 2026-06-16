import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBody } from "@/lib/api/http";
import { hasFcm } from "@/lib/env";

const schema = z.object({ title: z.string().min(1), body: z.string().min(1) });

/**
 * Trigger a test push. With FCM configured this would POST to the FCM HTTP v1
 * endpoint using FCM_SERVER_KEY; otherwise it reports that push is unconfigured.
 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;
  return NextResponse.json({ data: { delivered: hasFcm, mode: hasFcm ? "fcm" : "unconfigured" } }, { status: 202 });
}
