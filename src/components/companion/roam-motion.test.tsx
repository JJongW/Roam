import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RoamMotion } from "./roam-motion";

// 로미는 자르지 않는다. 영상들이 정사각형이 아니라(headbunting 478×620) object-cover를
// 쓰면 정사각 박스에서 머리·발이 잘린다. poster(logo.svg)도 같은 규칙으로 잘린다.
describe("RoamMotion", () => {
  it("영상을 자르지 않는다 — object-contain", () => {
    const { container } = render(<RoamMotion src="/headbunting.webm" />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.className).toContain("object-contain");
    expect(video!.className).not.toContain("object-cover");
  });

  it("className으로 덮어쓸 수 있다 — 잘라야 할 자리는 opt-in", () => {
    const { container } = render(
      <RoamMotion src="/headbunting.webm" className="object-cover" />,
    );
    expect(container.querySelector("video")!.className).toContain(
      "object-cover",
    );
  });
});
