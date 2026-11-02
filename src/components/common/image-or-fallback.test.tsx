import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ImageOrFallback } from "@/components/common/image-or-fallback";

const fallback = <span>대체</span>;

describe("ImageOrFallback", () => {
  it("src가 없으면 대체 표시", () => {
    render(<ImageOrFallback src={null} alt="로고" fallback={fallback} />);
    expect(screen.getByText("대체")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("불러오기 실패하면 대체 표시로 바뀐다 — 빈 칸이 남지 않는다", () => {
    render(<ImageOrFallback src="/broken.webp" alt="로고" fallback={fallback} />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText("대체")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("src가 바뀌면 다시 시도한다 — 한 번 실패가 영구 낙인이 되면 안 된다", () => {
    const { rerender } = render(
      <ImageOrFallback src="/a.webp" alt="로고" fallback={fallback} />,
    );
    fireEvent.error(screen.getByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();

    rerender(<ImageOrFallback src="/b.webp" alt="로고" fallback={fallback} />);
    expect(screen.getByRole("img")).toHaveAttribute("src", "/b.webp");
  });
});
