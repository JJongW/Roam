import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JudgmentBar } from "./judgment-bar";
import { useVisitStore } from "@/lib/stores/visit";

const props = {
  boothId: "b1",
  boothName: "테스트 부스",
  categoryLabel: "독립출판",
  interestSlugs: ["discovery"],
  exhibitionSlug: "sibf-2026",
};

beforeEach(() => {
  useVisitStore.setState({ records: {}, hasPendingSync: false });
});

describe("JudgmentBar mode=interest", () => {
  it("3칸을 렌더한다: 꼭 갈래·끌려·패스", () => {
    render(<JudgmentBar {...props} mode="interest" />);
    expect(screen.getByRole("button", { name: /꼭 갈래/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /끌려/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /패스/ })).toBeInTheDocument();
  });

  it("꼭 갈래를 누르면 스토어에 interest='must'가 반영된다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="interest" />);
    await user.click(screen.getByRole("button", { name: /꼭 갈래/ }));
    expect(useVisitStore.getState().records["b1"]?.interest).toBe("must");
  });

  it("같은 버튼을 다시 누르면 해제된다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="interest" />);
    const btn = screen.getByRole("button", { name: /끌려/ });
    await user.click(btn);
    await user.click(btn);
    expect(useVisitStore.getState().records["b1"]?.interest).toBeUndefined();
  });
});

describe("JudgmentBar mode=verdict", () => {
  it("3칸을 렌더한다: 좋았어·그냥그랬어·아니었어", () => {
    render(<JudgmentBar {...props} mode="verdict" />);
    expect(screen.getByRole("button", { name: /좋았어/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /그냥그랬어/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /아니었어/ })).toBeInTheDocument();
  });

  it("좋았어를 누르면 스토어에 verdict='good'이 반영된다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="verdict" />);
    await user.click(screen.getByRole("button", { name: /좋았어/ }));
    expect(useVisitStore.getState().records["b1"]?.verdict).toBe("good");
  });
});

describe("JudgmentBar mode=adaptive", () => {
  it("interest·verdict 둘 다 없으면 interest 3칸 + '다녀왔어' 링크", () => {
    render(<JudgmentBar {...props} mode="adaptive" />);
    expect(screen.getByRole("button", { name: /꼭 갈래/ })).toBeInTheDocument();
    expect(screen.getByText(/다녀왔어/)).toBeInTheDocument();
  });

  it("interest는 있고 verdict 없으면 verdict 3칸 + '관심 바꾸기' 링크", () => {
    useVisitStore.setState({ records: { b1: { interest: "must" } }, hasPendingSync: false });
    render(<JudgmentBar {...props} mode="adaptive" />);
    expect(screen.getByRole("button", { name: /좋았어/ })).toBeInTheDocument();
    expect(screen.getByText(/관심 바꾸기/)).toBeInTheDocument();
  });

  it("verdict가 있으면 verdict 3칸(선택 표시) + '관심 바꾸기' 링크", () => {
    useVisitStore.setState({
      records: { b1: { interest: "must", verdict: "good" } },
      hasPendingSync: false,
    });
    render(<JudgmentBar {...props} mode="adaptive" />);
    const good = screen.getByRole("button", { name: /좋았어/ });
    expect(good).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/관심 바꾸기/)).toBeInTheDocument();
  });

  it("'다녀왔어' 링크를 누르면 verdict 3칸으로 바뀐다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="adaptive" />);
    await user.click(screen.getByText(/다녀왔어/));
    expect(screen.getByRole("button", { name: /좋았어/ })).toBeInTheDocument();
  });

  it("'관심 바꾸기' 링크를 누르면 interest 3칸으로 돌아간다", async () => {
    useVisitStore.setState({ records: { b1: { interest: "must" } }, hasPendingSync: false });
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="adaptive" />);
    await user.click(screen.getByText(/관심 바꾸기/));
    expect(screen.getByRole("button", { name: /꼭 갈래/ })).toBeInTheDocument();
  });
});
