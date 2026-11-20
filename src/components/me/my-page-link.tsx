import Link from "next/link";
import { UserRound } from "lucide-react";
import { label } from "@/lib/copy/v1";

/**
 * 홈 머리에서 마이페이지(UI 14)로 가는 사람 아이콘. iOS는 하단 탭 "마이페이지"(icon/user)로 들어오지만
 * 웹 홈에는 탭 바가 없어 같은 아이콘을 머리에 둔다. 로그인 전에도 보인다(14-01).
 */
export function MyPageLink() {
  return (
    <Link
      href="/me"
      aria-label={label.myPage}
      className="flex size-v2-x11 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
    >
      <UserRound aria-hidden className="size-[var(--roam-v2-icon-size-lg)]" />
    </Link>
  );
}
