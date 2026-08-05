import { ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { readBrain } from "@/lib/memory/service";

export async function GET() {
  const user = await getCurrentUser();
  const needsOnboarding = user
    ? (await readBrain(user.id)).interests.length === 0
    : false;
  return ok({ user, needsOnboarding });
}
