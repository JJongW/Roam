import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BoothCard } from "./booth-card";
import type { Booth, Category } from "@/lib/types";

const booth: Booth = {
  id: "booth_nova",
  exhibitionId: "e1",
  hallId: "h1",
  categoryId: "cat_ai",
  name: "Nova LLM Studio",
  company: "Nova AI",
  description: "demo",
  longDescription: "",
  images: [],
  tags: ["ai"],
  x: 0,
  y: 0,
  popularity: 96,
  createdAt: "",
};

const category: Category = {
  id: "cat_ai",
  slug: "ai",
  name: "AI",
  color: "#3182f6",
  icon: "BrainCircuit",
};

describe("BoothCard", () => {
  it("renders name, company and category", () => {
    render(<BoothCard booth={booth} category={category} />);
    expect(screen.getByText("Nova LLM Studio")).toBeInTheDocument();
    expect(screen.getByText("Nova AI")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
  });

  it("links to the booth detail page", () => {
    render(<BoothCard booth={booth} category={category} />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/booths/booth_nova",
    );
  });

  it("shows the order badge when provided", () => {
    render(<BoothCard booth={booth} category={category} order={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders a thin row in compact mode", () => {
    render(<BoothCard booth={booth} category={category} compact />);
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      `/booths/${booth.id}`,
    );
  });
});
