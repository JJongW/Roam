import { getRepository } from "@/lib/repositories";
import { ok, requireAdmin } from "@/lib/api/http";

const RETENTION_DAYS = 30;

/** 30일 지난 오류 로그를 지운다. 크론 없음 — admin 화면 버튼이 수동으로 부른다. */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const deleted = await repo.deleteOldIssues(RETENTION_DAYS);
  return ok({ deleted });
}
