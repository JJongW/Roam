import { HeartList } from "@/components/me/heart-list";
import { listMeFairs } from "@/lib/me/fairs";
import { todayISO } from "@/lib/exhibition/current";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.heartedPlaces };

/** UI 14-02, 14-07 하트 남긴 곳 전체. 로그인 없이 연다. */
export default async function HeartsPage() {
  return <HeartList fairs={await listMeFairs()} today={todayISO()} />;
}
