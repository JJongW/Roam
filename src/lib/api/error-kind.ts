import type { ApiErrorCode } from "@/lib/types";

/**
 * 화면이 **구분해야 하는** 실패의 종류 — 서버 코드 7종 + 네트워크가 없는 경우.
 *
 * `OFFLINE`은 서버가 준 코드가 아니라 클라이언트가 붙인다. `ApiErrorCode`는 HTTP
 * 상태와 1:1인 서버 계약이라 거기에 끼워 넣으면 안 된다(fail()의 STATUS 표).
 */
export type ErrorKind = ApiErrorCode | "OFFLINE";

/**
 * 이 실패 앞에서 사용자가 할 수 있는 **단 하나의** 행동.
 *
 * - `retry` — 같은 걸 다시 한다. 될 가능성이 있을 때만.
 * - `login` — 로그인하면 풀린다.
 * - `reload` — 내가 보던 상태가 낡았다. 최신을 받아야 한다.
 * - `leave` — 이 화면에서 할 수 있는 게 없다. 나간다.
 * - `fix` — 화면에 있는 입력을 고친다. **버튼을 주지 않는다**(고칠 곳은 입력란이다).
 */
export type ErrorAction = "retry" | "login" | "reload" | "leave" | "fix";

/**
 * 종류별로 무엇을 내줄지의 **단일 출처**.
 *
 * 이게 없던 동안 모든 실패가 "다시 해보기" 버튼 하나를 공유했다. 403에 그 버튼을
 * 주는 건 최악인데, 사용자가 절대 성공할 수 없는 버튼을 반복해서 누르게 된다.
 * 그래서 `action`은 코드마다 다르고, `retry`는 **다시 하면 될 수도 있는 것**에만 있다.
 *
 * `ourFault`는 빨강(destructive)을 쓸지 정한다. 빨강은 "우리 쪽이 깨졌다"에만 쓴다 —
 * 로그인이 풀린 것, 이미 처리된 것, 권한이 없는 것은 실패가 아니라 **상태**다.
 * 다 빨갛게 하면 사용자는 자기가 뭘 잘못했는지 찾기 시작한다.
 */
export const ERROR_SHAPE: Record<
  ErrorKind,
  { action: ErrorAction; ourFault: boolean }
> = {
  OFFLINE: { action: "retry", ourFault: false },
  VALIDATION: { action: "fix", ourFault: false },
  UNAUTHORIZED: { action: "login", ourFault: false },
  FORBIDDEN: { action: "leave", ourFault: false },
  NOT_FOUND: { action: "leave", ourFault: false },
  CONFLICT: { action: "reload", ourFault: false },
  UNPROCESSABLE: { action: "fix", ourFault: false },
  INTERNAL: { action: "retry", ourFault: true },
};

/** 사전 키. 오타가 나면 화면에 키 문자열이 그대로 보이므로 테스트로 묶어 둔다. */
export function errorCopyKey(kind: ErrorKind, part: "title" | "desc"): string {
  const head = kind.toLowerCase().replace(/_(.)/g, (_, c: string) =>
    c.toUpperCase(),
  );
  return `apiError.${head}${part === "title" ? "Title" : "Desc"}`;
}

export function errorActionKey(action: ErrorAction): string {
  return `apiError.action${action[0].toUpperCase()}${action.slice(1)}`;
}
