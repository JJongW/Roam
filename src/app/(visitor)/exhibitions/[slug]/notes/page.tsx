import { redirect } from "next/navigation";

/**
 * 예전 "내 메모장"(v1) 주소. v2에서는 메모가 부스 상세 "남기신 것"(6-05)에 있고, 다녀온 곳은
 * 박람회를 묶은 "다녀왔어요" 목록(6-10)에 모인다. 옛 링크가 끊기지 않게 그리로 보낸다.
 */
export default function NotesPage() {
  redirect("/visited");
}
