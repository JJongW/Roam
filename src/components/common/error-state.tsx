"use client";

import { ApiErrorState } from "@/components/common/api-error";
import { useOnline } from "@/lib/hooks/use-online";

/**
 * 데이터 로드 실패 폴백 — error.tsx(에러 바운더리)가 렌더. reset으로 세그먼트 재시도.
 *
 * 화면 자체는 `ApiErrorState` 하나로 모았다 — 실패 화면이 두 벌이면 "403에 재시도
 * 버튼을 주지 않는다" 같은 규칙을 한쪽만 지키게 된다.
 *
 * 이 자리로 올라온 오류는 서버에서 온 불투명한 값일 수 있어 종류를 모를 때가 많다
 * (그때는 INTERNAL로 떨어진다 = 기존 동작). 다만 **네트워크가 없다**는 건 브라우저가
 * 알려주므로, 그 경우엔 종류를 직접 지정한다 — 연결을 확인하면 될 일인데 "못 불러왔어"로
 * 덮으면 재시도만 반복하게 된다.
 */
export function ErrorState({
  error,
  reset,
}: {
  error?: unknown;
  reset: () => void;
}) {
  const offline = !useOnline();
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-16">
      <ApiErrorState
        error={error}
        kind={offline ? "OFFLINE" : undefined}
        onRetry={reset}
        className="w-full max-w-sm"
      />
    </div>
  );
}
