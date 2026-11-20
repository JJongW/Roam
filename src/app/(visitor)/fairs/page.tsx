import { AllFairs } from "@/components/home/all-fairs";
import { todayISO } from "@/lib/exhibition/current";
import { groupFairs } from "@/lib/exhibition/fair-groups";
import { loadFairEntries } from "@/lib/exhibition/fair-entries";
import { homeCopy } from "@/lib/copy/home";

export const metadata = { title: homeCopy.fairsTitle };

/** UI 20-02 박람회 전체. 홈의 "박람회 전체 보기"로 밀어 연다. 공개 화면이다(proxy.ts). */
export default async function FairsPage() {
  const { entries, fairs } = await loadFairEntries();
  const today = todayISO();
  return <AllFairs groups={groupFairs(entries, today)} fairs={fairs} today={today} />;
}
