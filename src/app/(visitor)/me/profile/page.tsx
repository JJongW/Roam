import { ProfileScreen } from "@/components/me/profile-screen";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.profile };

/** UI 15-02 프로필. 로그인한 분만(proxy). */
export default function ProfilePage() {
  return <ProfileScreen />;
}
