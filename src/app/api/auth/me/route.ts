import { ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";

export async function GET() {
  const user = await getCurrentUser();
  return ok({ user });
}
