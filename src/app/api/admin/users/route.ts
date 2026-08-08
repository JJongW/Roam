import { getRepository } from "@/lib/repositories";
import { ok, requireAdmin } from "@/lib/api/http";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const users = await repo.listUsers({ limit: 200 });
  return ok({ users });
}
