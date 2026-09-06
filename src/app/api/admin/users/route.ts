import { getRepository } from "@/lib/repositories";
import { ok, requireAdmin } from "@/lib/api/http";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  // 화면이 "N개 계정"을 총계처럼 읽히게 쓰고 있어, 상한에 걸렸는지를 같이
  // 내려준다 — 200번째 계정이 생긴 순간부터 헤더가 조용히 거짓말을 한다.
  const LIMIT = 200;
  const users = await repo.listUsers({ limit: LIMIT });
  return ok({ users, capped: users.length >= LIMIT, limit: LIMIT });
}
