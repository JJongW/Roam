import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { InterestFeed } from "./interest-feed";
import type { FeedItem } from "@/lib/feed/curate";
import type { BoothListItem, Category } from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

const booth = {
  id: "b1",
  exhibitionId: "e1",
  hallId: "h1",
  categoryId: "c1",
  code: "A1101",
  name: "유유출판사",
  company: "유유",
  description: "",
  images: [],
  tags: ["indie"],
  x: 0,
  y: 0,
  popularity: 50,
  createdAt: "2026-01-01",
} satisfies BoothListItem;

const items: FeedItem[] = [
  {
    booth,
    related: [],
    pick: "stable",
    grounding: {
      what: "작은 출판사의 에세이 위주 부스야.",
      why: "작은 출판사의 에세이 위주 부스야. 아까 ‘참융뜰’ 좋아했잖아.",
      quote: null,
      evidence: [],
      todo: [],
      confidence: "medium",
    },
  },
];

const categoryById: Record<string, Category> = {
  c1: { id: "c1", name: "독립출판", slug: "indie", color: "#4f46e5", icon: "book" },
};

describe("InterestFeed 타이포그래피", () => {
  it("로미 한 줄은 문장 크기(.type-body)로 렌더된다 — 12px 금지", () => {
    render(
      <InterestFeed
        items={items}
        categoryById={categoryById}
        memoryLine={undefined}
        slug="sibf-2026"
        round={0}
        poolLeft={3}
      />,
    );
    // 문장은 <span>, 크기 클래스는 감싼 <p>에 있다.
    const line = screen.getByText(/작은 출판사의 에세이 위주 부스야/).closest("p")!;
    expect(line).toHaveClass("type-body");
    expect(line.className).not.toMatch(/\btext-xs\b/);
  });
});
