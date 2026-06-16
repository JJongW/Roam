import { dataMode } from "@/lib/env";
import { ok } from "@/lib/api/http";

export async function GET() {
  return ok({ status: "ok", mode: dataMode, time: new Date().toISOString() });
}
