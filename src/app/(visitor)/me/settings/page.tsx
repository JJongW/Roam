import { SettingsScreen } from "@/components/me/settings-screen";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.settings };

/** UI 15-01 설정. 로그인 없이 연다(로그인 전에는 프로필과 계정 묶음이 없다). */
export default function SettingsPage() {
  return <SettingsScreen />;
}
