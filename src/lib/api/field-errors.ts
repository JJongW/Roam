import type { ZodError } from "zod";
import type { ApiError } from "@/lib/types";

/** 필드 이름 → 그 필드에 띄울 메시지 한 줄. */
export type FieldErrors = Record<string, string>;

/**
 * Zod 오류를 필드별로 가른다. 경로가 없는 오류(스키마 전체에 걸린 것)는 `_`로 모은다.
 *
 * 서버(`parseBody`)와 클라이언트가 **같은 함수**를 쓴다 — 안 그러면 같은 스키마가
 * 어디서 검사됐는지에 따라 사용자가 다른 메시지를 보게 된다.
 */
export function flattenZod(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/** 필드마다 첫 메시지만 — 한 칸 아래에 세 줄을 쌓으면 아무도 안 읽는다. */
export function firstPerField(
  fields: Record<string, string[]> | undefined,
): FieldErrors {
  const out: FieldErrors = {};
  for (const [key, messages] of Object.entries(fields ?? {})) {
    if (messages[0]) out[key] = messages[0];
  }
  return out;
}

/**
 * 던져진 값에서 필드별 메시지를 꺼낸다.
 *
 * 서버는 예전부터 400과 함께 `fields`를 보내고 있었는데(`parseBody`) 화면 어디서도
 * 읽지 않아, 사용자는 "입력값을 확인해 주세요" 토스트만 보고 **어느 칸이** 틀렸는지
 * 모른 채 폼을 다시 훑어야 했다.
 */
export function fieldErrorsOf(e: unknown): FieldErrors {
  const err = (e as { error?: ApiError } | null)?.error;
  if (!err || err.code !== "VALIDATION") return {};
  return firstPerField(err.fields);
}

/** 클라이언트 Zod 검사 결과를 칸별 메시지로. 서버 400과 같은 모양이 된다. */
export function zodFieldErrors(error: ZodError): FieldErrors {
  return firstPerField(flattenZod(error));
}
