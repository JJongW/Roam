import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  fieldErrorsOf,
  firstPerField,
  zodFieldErrors,
} from "@/lib/api/field-errors";
import { ApiClientError } from "@/lib/api/client";

describe("fieldErrorsOf", () => {
  it("서버가 400과 함께 보낸 칸별 메시지를 꺼낸다", () => {
    const e = new ApiClientError(
      {
        code: "VALIDATION",
        message: "입력값을 확인해 주세요",
        fields: { name: ["이름을 적어줘", "두 번째 메시지"], venue: ["장소를 적어줘"] },
      },
      400,
    );
    // 칸마다 첫 줄만 — 한 칸 아래 세 줄을 쌓으면 아무도 안 읽는다.
    expect(fieldErrorsOf(e)).toEqual({
      name: "이름을 적어줘",
      venue: "장소를 적어줘",
    });
  });

  it("VALIDATION이 아니면 칸에 붙이지 않는다 — 입력 문제가 아니다", () => {
    const e = new ApiClientError({ code: "CONFLICT", message: "이미 있어" }, 409);
    expect(fieldErrorsOf(e)).toEqual({});
  });

  it("오프라인·생 에러도 안전하게 빈 값", () => {
    expect(fieldErrorsOf(new Error("boom"))).toEqual({});
    expect(fieldErrorsOf(null)).toEqual({});
    expect(fieldErrorsOf(undefined)).toEqual({});
  });
});

describe("zodFieldErrors", () => {
  it("중첩 경로는 점으로 잇고, 경로 없는 오류는 _로 모은다", () => {
    const schema = z
      .object({ name: z.string().min(1, "이름을 적어줘"), tips: z.object({ a: z.string() }) })
      .refine((v) => v.name !== "로미", { message: "그 이름은 못 써" });
    const r = schema.safeParse({ name: "", tips: { a: 1 } });
    expect(r.success).toBe(false);
    if (r.success) return;
    const fields = zodFieldErrors(r.error);
    expect(fields.name).toBe("이름을 적어줘");
    expect(fields["tips.a"]).toBeTruthy();
  });

  it("경로 없는 오류는 _", () => {
    const schema = z
      .object({ a: z.string() })
      .refine(() => false, { message: "둘이 안 맞아" });
    const r = schema.safeParse({ a: "x" });
    if (r.success) throw new Error("실패해야 한다");
    expect(zodFieldErrors(r.error)._).toBe("둘이 안 맞아");
  });
});

describe("firstPerField", () => {
  it("빈 배열인 칸은 버린다 — 빈 오류 문단이 생기면 안 된다", () => {
    expect(firstPerField({ a: [], b: ["x"] })).toEqual({ b: "x" });
  });
  it("undefined도 받는다", () => {
    expect(firstPerField(undefined)).toEqual({});
  });
});
