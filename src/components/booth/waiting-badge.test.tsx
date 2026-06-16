import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WaitingBadge } from "./waiting-badge";
import type { Waiting } from "@/lib/types";

function w(p: Partial<Waiting>): Waiting {
  return { boothId: "b", enabled: true, queueCount: 10, estimatedMinutes: 5, updatedAt: "", ...p };
}

describe("WaitingBadge", () => {
  it("renders nothing when disabled", () => {
    const { container } = render(<WaitingBadge waiting={w({ enabled: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when no waiting", () => {
    const { container } = render(<WaitingBadge waiting={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the estimated minutes", () => {
    render(<WaitingBadge waiting={w({ estimatedMinutes: 12 })} />);
    expect(screen.getByText(/12분/)).toBeInTheDocument();
  });

  it("includes queue count when requested", () => {
    render(<WaitingBadge waiting={w({ queueCount: 42 })} showQueue />);
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it("labels congestion level for accessibility", () => {
    render(<WaitingBadge waiting={w({ estimatedMinutes: 30 })} />);
    expect(screen.getByLabelText(/혼잡/)).toBeInTheDocument();
  });
});
