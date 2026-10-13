import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

describe("Field", () => {
  it("라벨을 누르면 그 안의 입력이 잡힌다 — id를 호출부가 안 적어도", () => {
    render(
      <Field label="닉네임">
        <Input />
      </Field>,
    );
    // getByLabelText는 htmlFor↔id가 실제로 이어졌을 때만 찾는다.
    expect(screen.getByLabelText("닉네임").tagName).toBe("INPUT");
  });

  it("설명은 입력에 연결되고, 오류가 생기면 오류가 그 자리를 받는다", () => {
    const { rerender } = render(
      <Field label="닉네임" description="2자 이상">
        <Input />
      </Field>,
    );
    const hinted = screen.getByLabelText("닉네임");
    expect(hinted.getAttribute("aria-describedby")).toBe(
      screen.getByText("2자 이상").id,
    );
    expect(hinted).not.toHaveAttribute("aria-invalid");

    rerender(
      <Field label="닉네임" description="2자 이상" error="이미 쓰는 이름이야">
        <Input />
      </Field>,
    );
    const invalid = screen.getByLabelText("닉네임");
    expect(invalid).toHaveAttribute("aria-invalid", "true");
    // 설명은 사라지고 오류만 남는다 — 두 줄로 쌓이지 않는다.
    expect(screen.queryByText("2자 이상")).toBeNull();
    expect(invalid.getAttribute("aria-describedby")).toBe(
      screen.getByRole("alert").id,
    );
  });

  it("안 그려진 문단을 가리키지 않는다", () => {
    render(
      <Field label="닉네임">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("닉네임")).not.toHaveAttribute(
      "aria-describedby",
    );
  });

  it("error가 true면 테두리만 — 메시지 문단은 안 생긴다", () => {
    render(
      <Field label="닉네임" error>
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("닉네임")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("id는 Field가 쥔다 — 입력에 따로 달아도 라벨이 안 어긋난다", () => {
    render(
      <Field label="닉네임" description="2자 이상">
        <Input id="mine" aria-describedby="extra" />
      </Field>,
    );
    const input = screen.getByLabelText("닉네임");
    expect(input.id).not.toBe("mine");
    // 설명은 합쳐서 둘 다 읽힌다 — 덮어쓰면 한쪽이 안 읽힌다.
    expect(input.getAttribute("aria-describedby")).toBe(
      `${screen.getByText("2자 이상").id} extra`,
    );
  });

  it("특정 id가 필요하면 Field에 넘기고, 라벨이 그걸 따라간다", () => {
    render(
      <Field id="nick" label="닉네임">
        <Input />
      </Field>,
    );
    expect(screen.getByLabelText("닉네임").id).toBe("nick");
  });

  it("Field 밖의 입력은 아무것도 물려받지 않는다", () => {
    render(<Input aria-label="혼자" />);
    const input = screen.getByLabelText("혼자");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toHaveAttribute("aria-invalid");
  });
});
