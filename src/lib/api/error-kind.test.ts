import { describe, expect, it } from "vitest";
import {
  ERROR_SHAPE,
  errorActionKey,
  errorCopyKey,
  type ErrorKind,
} from "@/lib/api/error-kind";
import { DICTS } from "@/lib/i18n/dictionaries";
import { makeT } from "@/lib/i18n/resolve";

const KINDS = Object.keys(ERROR_SHAPE) as ErrorKind[];

describe("ERROR_SHAPE", () => {
  it("될 수 없는 걸 다시 하라고 하지 않는다", () => {
    // 403·401은 같은 요청을 백 번 보내도 결과가 같다 — 재시도 버튼은 거짓말이다.
    const liars = KINDS.filter(
      (k) =>
        ERROR_SHAPE[k].action === "retry" &&
        (k === "FORBIDDEN" || k === "UNAUTHORIZED" || k === "VALIDATION"),
    );
    expect(liars).toEqual([]);
  });

  it("빨강은 우리 쪽이 깨진 경우에만", () => {
    expect(KINDS.filter((k) => ERROR_SHAPE[k].ourFault)).toEqual(["INTERNAL"]);
  });

  it("입력으로 푸는 실패엔 버튼을 주지 않는다", () => {
    expect(ERROR_SHAPE.VALIDATION.action).toBe("fix");
    expect(ERROR_SHAPE.UNPROCESSABLE.action).toBe("fix");
  });
});

describe("문구", () => {
  it.each(["ko", "en"] as const)("%s 사전에 8종 전부의 제목·설명이 있다", (locale) => {
    const t = makeT(DICTS[locale]);
    const missing: string[] = [];
    for (const kind of KINDS) {
      for (const part of ["title", "desc"] as const) {
        const key = errorCopyKey(kind, part);
        // 사전에 없으면 t()가 키를 그대로 돌려준다 — 화면에 "apiError.x"가 뜬다.
        if (t(key) === key) missing.push(key);
      }
    }
    expect(missing).toEqual([]);
  });

  it.each(["ko", "en"] as const)("%s 사전에 행동 라벨이 있다 (fix는 버튼이 없다)", (locale) => {
    const t = makeT(DICTS[locale]);
    const actions = [...new Set(KINDS.map((k) => ERROR_SHAPE[k].action))].filter(
      (a) => a !== "fix",
    );
    const missing = actions
      .map(errorActionKey)
      .filter((key) => t(key) === key);
    expect(missing).toEqual([]);
  });
});
