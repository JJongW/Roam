import type { ApiError } from "@/lib/types";
import type { ErrorKind } from "@/lib/api/error-kind";

export class ApiClientError extends Error {
  /**
   * 화면이 분기할 때 쓰는 종류. 보통은 서버가 준 `error.code`와 같고, 요청이
   * 나가지도 못했을 때만 "OFFLINE"이다 — `error.code`(서버 계약)는 건드리지 않는다.
   */
  readonly kind: ErrorKind;

  constructor(
    public readonly error: ApiError,
    public readonly status: number,
    kind?: ErrorKind,
  ) {
    super(error.message);
    this.name = "ApiClientError";
    this.kind = kind ?? error.code;
  }

  get offline(): boolean {
    return this.kind === "OFFLINE";
  }
}

/** 요청이 네트워크를 떠나지도 못한 경우. 서버 응답이 없으니 HTTP 상태도 없다. */
const NO_RESPONSE = 0;

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    // fetch가 거부되는 건 "서버가 오류를 냈다"가 아니라 **요청이 나가지도 못했다**는
    // 뜻이다(비행기 모드·지하·와이파이 끊김). 지금까지 이건 어디서도 안 잡혀서
    // 호출부의 catch에 생 TypeError로 떨어졌고, 사용자는 서버 오류와 똑같은 화면을
    // 봤다 — 연결을 확인하면 될 일인데 "다시 해보기"만 반복해서 눌렀다.
    throw new ApiClientError(
      { code: "INTERNAL", message: "네트워크에 연결되지 않았어" },
      NO_RESPONSE,
      "OFFLINE",
    );
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || "error" in json) {
    const error: ApiError = json?.error ?? { code: "INTERNAL", message: "네트워크 오류" };
    throw new ApiClientError(error, res.status);
  }
  return json.data as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
