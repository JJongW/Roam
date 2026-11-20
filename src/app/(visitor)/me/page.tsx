import { MyPage } from "@/components/me/my-page";
import { listMeFairs } from "@/lib/me/fairs";
import { todayISO } from "@/lib/exhibition/current";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.myPage };

/** UI 14 마이페이지. 기록은 이 브라우저(로그인하면 계정과 합친 것)에 있어 클라이언트가 그린다. 로그인 없이 연다(14-01). */
export default async function MePage() {
  return <MyPage fairs={await listMeFairs()} today={todayISO()} />;
}
