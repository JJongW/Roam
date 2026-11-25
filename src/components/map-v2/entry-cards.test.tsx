import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FirstPickCard, FirstPickPreviewSheet } from "./entry-cards";
import type { BoothListItem } from "@/lib/types";

const booth = {
  id: "b1",
  name: "디어더스레드",
  code: "J-19",
  categoryId: "c1",
  description: "",
  images: ["/a.jpg", "/b.jpg"],
  tags: [],
  enrichment: { summary: "직접 그리고 작업한 한국 채색화 그림으로 만든 소품들 입니다." },
} as unknown as BoothListItem;

const sheetProps = {
  booth,
  code: "J-19",
  reason: "고르신 사진의 부스예요.",
  categoryName: "일러스트레이터",
  index: 0,
  total: 3,
  head: "고르신 사진으로 세 곳을 골라 봤어요",
  detailHref: "/booths/b1",
};

afterEach(() => vi.unstubAllGlobals());

describe("FirstPickCard(UI 24 Q2A-1)", () => {
  it("이름 줄을 누르면 미리보기를 연다. 하트와 이건 아니에요는 그대로다", async () => {
    const onPreview = vi.fn();
    const onHeart = vi.fn();
    render(
      <FirstPickCard
        {...sheetProps}
        onHeart={onHeart}
        onNotThis={() => {}}
        onLater={() => {}}
        onPreview={onPreview}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /디어더스레드/ }));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onHeart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "이건 아니에요" })).toBeInTheDocument();
  });
});

describe("FirstPickPreviewSheet(UI 24 Q2A-2)", () => {
  const stubFetch = (data: unknown) =>
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ data }) })));

  it("사진, 이름과 번호, 분류, 소개, 하트 남기기, 자세히 보기(상세로)를 보인다. 진행은 그대로", () => {
    stubFetch(null);
    render(<FirstPickPreviewSheet {...sheetProps} onHeart={() => {}} onLater={() => {}} onDetail={() => {}} onClose={() => {}} />);
    expect(screen.getAllByRole("img")).toHaveLength(2);
    expect(screen.getByText("J-19")).toBeInTheDocument();
    expect(screen.getByText("일러스트레이터")).toBeInTheDocument();
    expect(screen.getByText(/한국 채색화/)).toBeInTheDocument();
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "자세히 보기" })).toHaveAttribute("href", "/booths/b1");
    expect(screen.queryByRole("button", { name: "이건 아니에요" })).toBeNull();
  });

  it("상세와 같은 출처로 소개를 바꾼다(브랜드 공식 소개 우선, 원문 그대로)", async () => {
    stubFetch({ booth, brandIntro: { text: "브랜드가 직접 쓴 소개예요." } });
    render(<FirstPickPreviewSheet {...sheetProps} onHeart={() => {}} onLater={() => {}} onDetail={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("브랜드가 직접 쓴 소개예요.")).toBeInTheDocument());
  });

  it("하트 남기기, 바깥 누르기, 아래로 밀기", async () => {
    stubFetch(null);
    const onHeart = vi.fn();
    const onClose = vi.fn();
    render(<FirstPickPreviewSheet {...sheetProps} onHeart={onHeart} onLater={() => {}} onDetail={() => {}} onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "하트 남기기" }));
    expect(onHeart).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const sheet = screen.getByText("디어더스레드").closest("section")!;
    vi.spyOn(sheet, "getBoundingClientRect").mockReturnValue({ height: 400 } as DOMRect);
    // 옆으로 민 손(사진 넘김)은 닫지 않는다.
    fireEvent.touchStart(sheet, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientX: 20, clientY: 130 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientX: 0, clientY: 300 }] });
    fireEvent.touchEnd(sheet);
    expect(onClose).toHaveBeenCalledTimes(1);
    // 짧게 내리면 제자리.
    fireEvent.touchStart(sheet, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientX: 200, clientY: 150 }] });
    fireEvent.touchEnd(sheet);
    expect(onClose).toHaveBeenCalledTimes(1);
    // 시트 높이의 4분의 1을 넘게 내리면 닫힌다.
    fireEvent.touchStart(sheet, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(sheet, { touches: [{ clientX: 200, clientY: 250 }] });
    fireEvent.touchEnd(sheet);
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
