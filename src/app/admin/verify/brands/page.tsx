import { redirect } from "next/navigation";

/**
 * "같은 브랜드인가요?"는 브랜드 메뉴의 연결 확인 목록으로 옮겼다(2026-11-03 Ted 결정:
 * "브랜드"와 "브랜드 연결"을 하나로). 예전 주소로 들어와도 같은 일을 하게 넘긴다.
 */
export default function LegacyBrandLinkPage() {
  redirect("/admin/brands/links");
}
