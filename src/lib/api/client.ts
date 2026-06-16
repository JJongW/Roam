import type { ApiError } from "@/lib/types";

export class ApiClientError extends Error {
  constructor(
    public readonly error: ApiError,
    public readonly status: number,
  ) {
    super(error.message);
    this.name = "ApiClientError";
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
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
