import { clearUserCookie, noContent } from "@/lib/api/http";

export async function POST() {
  await clearUserCookie();
  return noContent();
}
