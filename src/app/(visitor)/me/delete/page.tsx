import { DeleteAccount } from "@/components/me/delete-account";
import { label } from "@/lib/copy/v1";

export const metadata = { title: label.deleteAccount };

/** UI 15-11 계정 삭제. 로그인한 분만(proxy). */
export default function DeletePage() {
  return <DeleteAccount />;
}
