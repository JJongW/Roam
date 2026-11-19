import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { notificationPrefsSchema } from "@/lib/schemas";

/**
 * 서버가 아는 알림 켜고 끄기(0071 notification_pref). 줄이 없으면 켜짐.
 * iOS 설정의 "하트 남긴 브랜드가 박람회에 나올 때"(PushToggleRow, brand_appear)는 지금 기기에만
 * 저장한다. 이 API로 올리는 건 Roam-ios 따로 작업이다. 브랜드 알림 잡은 꺼진 사람을 고르지 않는다.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  const prefs = await repo.getNotificationPrefs(user.id);
  return ok({ brand_appear: prefs.brand_appear ?? true });
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const parsed = await parseBody(req, notificationPrefsSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  await repo.setNotificationPref(user.id, "brand_appear", parsed.data.brand_appear);
  return ok({ brand_appear: parsed.data.brand_appear });
}
