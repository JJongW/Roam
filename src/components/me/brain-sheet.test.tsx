import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrainSheet } from "./brain-sheet";
import { api } from "@/lib/api/client";
import type { UserBrain } from "@/lib/types";

const brain = (over: Partial<UserBrain> = {}): UserBrain => ({
  userId: "u1",
  version: 1,
  updatedAt: "",
  literacy: { overall: 0.4, byTheme: {}, visitsCount: 2, boothsSeenCount: 9 },
  interests: [
    {
      key: "discovery",
      label: "발견",
      confidence: 0.8,
      signals: { explicit: 3, implicit: 1, negative: 0 },
      firstSeenAt: "",
      lastSeenAt: "",
      trend: "up",
    },
  ],
  mutedSlugs: [],
  preferences: {},
  goals: [],
  visits: [],
  health: { lastDistilledAt: "", decayHalfLifeDays: 90 },
  ...over,
});

describe("BrainSheet 관심 고치기", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("고치기 모드에서 8가치가 전부 뜬다 — 뺄 것도 보여야 뺄 수 있다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: brain() });
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    // Sheet는 Radix Portal이라 document.body에 렌더된다 — RTL의 container 밖.
    expect(
      document.body.querySelectorAll('[data-testid^="value-toggle-"]'),
    ).toHaveLength(8);
  });

  it("켜진 가치를 누르면 muted:true로 PUT 한다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: brain() });
    const put = vi.spyOn(api, "put").mockResolvedValue({ needsSeed: false });
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-discovery"));
    expect(put).toHaveBeenCalledWith("/api/me/values/discovery", {
      muted: true,
    });
  });

  it("꺼진 가치를 누르면 muted:false로 PUT 한다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ mutedSlugs: ["goods"] }),
    });
    const put = vi.spyOn(api, "put").mockResolvedValue({ needsSeed: true });
    vi.spyOn(api, "post").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-goods"));
    expect(put).toHaveBeenCalledWith("/api/me/values/goods", { muted: false });
  });

  // 시드 여부는 서버(PUT 응답의 needsSeed)만 안다. 아래 두 테스트의 클라 상태는
  // 똑같다 — 둘 다 goods가 뮤트돼 interests에서 빠져 있어 화면 값이 0이다. 그래도
  // 결과가 갈려야 한다. 예전처럼 클라가 values 맵으로 판단하면 둘 다 POST가 나간다.
  it("서버가 needsSeed:true면 명시 긍정 신호도 함께 POST 한다 — 쌓인 게 없으면 뮤트만 풀어봐야 여전히 0이라 반응이 없어 보인다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ mutedSlugs: ["goods"] }),
    });
    const put = vi.spyOn(api, "put").mockResolvedValue({ needsSeed: true });
    const post = vi.spyOn(api, "post").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-goods"));
    expect(put).toHaveBeenCalledWith("/api/me/values/goods", { muted: false });
    expect(post).toHaveBeenCalledWith("/api/me/values", { values: ["goods"] });
  });

  it("서버가 needsSeed:false면 명시 긍정 신호를 보내지 않는다 — 화면 값은 똑같이 0이지만 서버엔 이력이 있다", async () => {
    // 뮤트된 가치는 서버 증류에서 이미 빠져 내려오므로 interests에 goods가 없다.
    // 클라가 스스로 판단하면 "0이니까 시드하자"가 되어 토글마다 confidence가 오른다.
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ mutedSlugs: ["goods"] }),
    });
    const put = vi.spyOn(api, "put").mockResolvedValue({ needsSeed: false });
    const post = vi.spyOn(api, "post").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-goods"));
    expect(put).toHaveBeenCalledWith("/api/me/values/goods", { muted: false });
    expect(post).not.toHaveBeenCalled();
  });

  it("PUT은 됐는데 뒤이은 POST가 실패해도 화면을 다시 읽는다 — 서버엔 이미 반영됐으니 옛 상태로 남으면 안 된다", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ mutedSlugs: ["goods"] }),
    });
    vi.spyOn(api, "put").mockResolvedValue({ needsSeed: true });
    vi.spyOn(api, "post").mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    expect(get).toHaveBeenCalledTimes(1); // 최초 로드만

    await user.click(screen.getByTestId("value-toggle-goods"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2)); // 재조회가 반드시 돈다
  });
});

// 전부 끄면 되돌릴 길이 없어지던 일방통행 — 값이 비었다고 화면을 안내 문구로
// 갈아치우면 다시 켤 버튼까지 사라진다(앱 어디에도 다른 해제 UI가 없다).
describe("BrainSheet 빈 값 처리", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const allValues = [
    "discovery",
    "experience",
    "goods",
    "social",
    "learning",
    "trend",
    "inspiration",
    "rest",
  ];

  it("8가치를 전부 꺼도 레이더와 고치기 버튼이 그대로 있다 — 다시 켤 수 있어야 한다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ interests: [], mutedSlugs: allValues }),
    });
    render(<BrainSheet open onClose={() => {}} />);

    await waitFor(() => screen.getByRole("img", { name: "내 취향 분포" }));
    expect(
      screen.getByRole("button", { name: /고치기|Edit/i }),
    ).toBeInTheDocument();
    // 이력은 멀쩡히 남아 있다 — "기록이 없다"는 거짓말이라 띄우지 않는다.
    expect(screen.queryByText(/아직 기록이 없어/)).toBeNull();
  });

  it("전부 끈 상태에서도 고치기를 열면 8칸이 뜨고 다시 켤 수 있다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ interests: [], mutedSlugs: allValues }),
    });
    const put = vi.spyOn(api, "put").mockResolvedValue({ needsSeed: true });
    vi.spyOn(api, "post").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);

    await waitFor(() => screen.getByRole("img", { name: "내 취향 분포" }));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    expect(
      document.body.querySelectorAll('[data-testid^="value-toggle-"]'),
    ).toHaveLength(8);

    await user.click(screen.getByTestId("value-toggle-goods"));
    expect(put).toHaveBeenCalledWith("/api/me/values/goods", { muted: false });
  });

  it("정말 기록이 없는 첫 사용자에게만 안내를 얹는다 — 레이더를 가리지 않고 캡션으로", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ interests: [], mutedSlugs: [] }),
    });
    render(<BrainSheet open onClose={() => {}} />);

    await waitFor(() => screen.getByRole("img", { name: "내 취향 분포" }));
    expect(screen.getByText(/아직 기록이 없어/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /고치기|Edit/i }),
    ).toBeInTheDocument();
  });

  it("브레인을 못 읽었을 때만 안내로 대체한다 — 그릴 게 아예 없다", async () => {
    vi.spyOn(api, "get").mockRejectedValue(new Error("boom"));
    render(<BrainSheet open onClose={() => {}} />);

    await waitFor(() => screen.getByText(/아직 기록이 없어/));
    expect(screen.queryByRole("img", { name: "내 취향 분포" })).toBeNull();
    expect(screen.queryByRole("button", { name: /고치기|Edit/i })).toBeNull();
  });
});
