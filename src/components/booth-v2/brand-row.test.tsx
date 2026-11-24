import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrandRow } from "./brand-row";

describe("BrandRow(UI 23 Q1 C)", () => {
  it("브랜드 이름과 설명 한 줄만 보이고, 누를 단추가 없다", () => {
    render(<BrandRow name="꽃잠" />);
    expect(screen.getByText("꽃잠")).toBeInTheDocument();
    expect(screen.getByText("부스 하트를 남기면 이 브랜드의 다음 박람회 참가도 알려 드려요")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
