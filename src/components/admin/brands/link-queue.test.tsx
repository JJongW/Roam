import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LinkRow } from "@/lib/brands/links";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
const post = vi.fn();
vi.mock("@/lib/api/client", () => ({
  api: { post: (...a: unknown[]) => post(...a) },
  ApiClientError: class extends Error {},
}));

import { LinkQueue } from "./link-queue";

// 새해 준비상점(부스 0)의 네츄럴굿띵스 참가 ↔ 하우스 아카이브에 나온 기존 브랜드.
const boothless: LinkRow = {
  id: "xlc_ngt",
  reason: '이름이 같아요: "네츄럴굿띵스"',
  evidence: ["이름이 같아요: 네츄럴굿띵스", "이 참가의 다른 이름: NGT", "브랜드가 나온 박람회: 하우스 아카이브 2026"],
  subject: { key: "pt_ny311", participantId: "pt_ny311", exhibitionName: "새해 준비상점", startDate: "2026-12-10", name: "네츄럴굿띵스", aliases: ["NGT"], summary: "" },
  from: { exhibitorId: "exr_ny311", name: "네츄럴굿띵스", aliases: ["NGT"] },
  fromExhibitorId: "exr_ny311",
  target: {
    exhibitorId: "exr_xpip468cmupq9q23",
    name: "네츄럴굿띵스",
    aliases: [],
    instagramUrl: "https://instagram.com/ngt_kr",
    appearances: [
      { key: "pt_house", participantId: "pt_house", boothId: "b1", code: "A12", exhibitionName: "하우스 아카이브 2026", startDate: "2026-09-01", name: "네츄럴굿띵스", instagramUrl: "https://instagram.com/ngt_kr", summary: "" },
    ],
  },
  createdAt: "2026-11-20T00:00:00Z",
};
const withBooth: LinkRow = {
  ...boothless,
  id: "xlc_booth",
  subject: { ...boothless.subject!, key: "pt_b", participantId: "pt_b", boothId: "b9", code: "C3", exhibitionName: "문구전", name: "하치공방", aliases: undefined },
  target: { ...boothless.target, exhibitorId: "exr_hachi", name: "하치공방" },
};

describe("LinkQueue — 참가 단위 연결 확인", () => {
  beforeEach(() => {
    refresh.mockReset();
    post.mockReset();
  });

  it("부스 없는 참가와 부스 있는 참가를 같이 그리고, 근거와 브랜드 인스타를 보여 준다", () => {
    render(<LinkQueue rows={[boothless, withBooth]} rejectedCount={0} />);
    expect(screen.getByText('새해 준비상점의 "네츄럴굿띵스" 참가를 브랜드 “네츄럴굿띵스”에 이어도 될까요?')).toBeInTheDocument();
    expect(screen.getByText(/새해 준비상점, 부스는 아직 없어요/)).toBeInTheDocument();
    expect(screen.getByText(/문구전, 부스 C3/)).toBeInTheDocument();
    expect(screen.getAllByText("이 참가의 다른 이름: NGT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("브랜드가 나온 박람회: 하우스 아카이브 2026").length).toBeGreaterThan(0);
    expect(screen.getAllByText("ngt_kr").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/전시|·/);
  });

  it("부스 없는 줄을 골라 연결하면 그 후보 id로 승인을 보낸다", async () => {
    post.mockResolvedValue({ done: 1, skipped: 0, results: [{ id: "xlc_ngt" }] });
    render(<LinkQueue rows={[boothless]} rejectedCount={0} />);
    fireEvent.click(screen.getByLabelText("네츄럴굿띵스 참가를 네츄럴굿띵스에 잇기 선택"));
    fireEvent.click(screen.getByRole("button", { name: "선택한 1건 연결" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/brands/links", { ids: ["xlc_ngt"], decision: "approved" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("연결 안 함도 보낸다", async () => {
    post.mockResolvedValue({ done: 1, skipped: 0, results: [{ id: "xlc_ngt" }] });
    render(<LinkQueue rows={[boothless]} rejectedCount={2} />);
    fireEvent.click(screen.getByLabelText("네츄럴굿띵스 참가를 네츄럴굿띵스에 잇기 선택"));
    fireEvent.click(screen.getByRole("button", { name: "연결 안 함" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/api/admin/brands/links", { ids: ["xlc_ngt"], decision: "rejected" }));
  });
});
