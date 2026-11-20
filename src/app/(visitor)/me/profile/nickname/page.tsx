import { NicknameScreen } from "@/components/me/profile-screen";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.nickname };

/** UI 15-03 닉네임 바꾸기. 로그인한 분만(proxy). */
export default function NicknamePage() {
  return <NicknameScreen />;
}
