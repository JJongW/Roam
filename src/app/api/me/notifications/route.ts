import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { inboxItem } from "@/lib/notifications/inbox";

/** 알림함 보관 기간. 이보다 오래된 줄은 보이지 않는다(지우지는 않는다). */
const INBOX_DAYS = 30;

/**
 * 내 알림함(UI 18 1-A, 홈 위 종). 최근 30일, 최신순. 보내기 전(queued) 줄은 빼서
 * 푸시와 알림함이 같은 순간에 생기게 한다. 기기가 없어 푸시가 못 간 줄(no_device)도 보인다.
 * `landing`은 푸시 userInfo와 같은 모양이라 iOS가 PushLanding(userInfo:)를 그대로 쓴다.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  const since = new Date(Date.now() - INBOX_DAYS * 86_400_000).toISOString();
  const rows = await repo.listNotifications(user.id, since);
  const items = rows.map(inboxItem);
  return ok({ items, unread: items.filter((i) => !i.readAt).length });
}
