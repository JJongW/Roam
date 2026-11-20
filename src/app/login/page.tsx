import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = {
  // 루트 레이아웃 템플릿이 "%s | Roam"이라 여기에 " | Roam"을 또 붙이면
  // "로그인 | Roam | Roam"이 된다.
  title: "로그인",
};

/**
 * 로그인 화면(UI 5-04, 실패는 5-07). 로그인이 필요한 경로에서 proxy.ts가 `next`를 붙여 이리로 보내고,
 * 하트 뒤 로그인 제안(5-02)의 "로그인"도 이리로 온다. Suspense는 useSearchParams 때문이다.
 */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
