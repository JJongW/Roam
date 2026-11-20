"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginPanel, safeNext } from "@/components/auth/login-panel";
import { hasNavigatedInApp } from "@/components/common/nav-tracker";

/**
 * `/login` 페이지. 앱 안에서 로그인을 부르는 자리는 지금 화면 위에 시트(`LoginSheet`)를 띄우고,
 * 이 페이지는 로그인이 필요한 주소로 바로 들어온 사람(proxy.ts가 `?next=`를 붙여 보낸다)만 본다.
 * 내용은 시트와 같다(`LoginPanel`, UI 5-04, 5-07). 화면 아래(엄지 닿는 자리)에 시트처럼 모았다.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const source = params.get("from") ?? (params.get("next") ? "gate" : "direct");
  // 첫 렌더의 실패 이유를 붙잡아 둔다(AuthBootstrap이 주소에서 지운다).
  const [returned] = useState(() => params.get("login_error"));

  return (
    <main className="flex min-h-dvh flex-col bg-v2-bg-layer-basement font-v2-ui text-v2-fg-neutral">
      <div className="flex-1" />
      <div className="mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] rounded-t-v2-r6 bg-v2-bg-layer-floating px-v2-x4 pb-safe pt-v2-x8">
        <LoginPanel
          next={next}
          source={source}
          returned={returned}
          via="page"
          // 5-06 로그인 없이 계속: 왔던 곳으로. Google을 돌아온 뒤거나 바로 열었으면 앱 안 뒤로 갈 곳이 없어 홈으로.
          onSkip={() => {
            if (!returned && hasNavigatedInApp()) router.back();
            else router.push("/");
          }}
          // 쿠키를 새로 읽도록 전체 이동한다(5-05는 login()이 이미 띄웠다).
          onNicknameDone={() => window.location.assign(next)}
        />
      </div>
    </main>
  );
}
