import { InboxScreen } from "@/components/inbox/inbox-screen";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.inbox };

/** UI 18-02 알림함. 로그인한 분만(proxy가 /login으로 보낸다). 알림은 계정에 있어 클라이언트가 불러온다. */
export default function InboxPage() {
  return <InboxScreen />;
}
