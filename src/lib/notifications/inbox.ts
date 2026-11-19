// 알림함 한 줄의 응답 모양(GET /api/me/notifications). 순수.
import type { NotificationLog } from "@/lib/types";
import { itemOf } from "./brand-appear";

export interface InboxItem {
  id: string;
  kind: NotificationLog["kind"];
  title: string;
  body: string;
  createdAt: string;
  readAt: string | null;
  /** 눌렀을 때 갈 곳. 푸시 userInfo와 같은 키(iOS PushLanding). */
  landing: { kind: "brand"; slug: string; exhibitorIds: string[]; boothId?: string };
  brand: { exhibitorId: string; name: string };
  fair: { slug: string; name: string; startDate: string; endDate: string };
}

export function inboxItem(n: NotificationLog): InboxItem {
  const it = itemOf(n);
  return {
    id: n.id,
    kind: n.kind,
    title: n.title,
    body: n.body,
    createdAt: n.createdAt,
    readAt: n.readAt ?? null,
    landing: { kind: "brand", slug: it.slug, exhibitorIds: [it.exhibitorId], ...(it.boothId ? { boothId: it.boothId } : {}) },
    brand: { exhibitorId: it.exhibitorId, name: it.brandName },
    fair: { slug: it.slug, name: it.fairName, startDate: it.startDate, endDate: it.endDate },
  };
}
