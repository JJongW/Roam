import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import { setValueMuted } from "@/lib/memory/service";
import { valueLabel } from "@/lib/values";

// 뮤트는 멱등이어야 한다 — 같은 요청을 두 번 보내도 목록이 중복되면 안 된다.
// 그리고 순서에 의존하면 안 된다(같은 집합이면 같은 결과).
describe("setValueMuted", () => {
  const repo = new MockRepository();
  let userId: string;

  beforeEach(async () => {
    // repository.test.ts와 동일한 리셋 방식 — 전역 스토어를 비워 시드부터 다시 만든다.
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore =
      undefined;
    const user = await repo.createUser("tester");
    userId = user.id;
  });

  it("끄면 목록에 들어간다", async () => {
    const brain = await setValueMuted(userId, "goods", true);
    expect(brain.mutedSlugs).toContain("goods");
  });

  it("두 번 꺼도 중복되지 않는다 — 멱등", async () => {
    await setValueMuted(userId, "goods", true);
    const brain = await setValueMuted(userId, "goods", true);
    expect(brain.mutedSlugs!.filter((s) => s === "goods")).toHaveLength(1);
  });

  it("풀면 목록에서 빠진다", async () => {
    await setValueMuted(userId, "goods", true);
    const brain = await setValueMuted(userId, "goods", false);
    expect(brain.mutedSlugs).not.toContain("goods");
  });

  it("끈 적 없는 걸 풀어도 조용히 성공한다", async () => {
    const brain = await setValueMuted(userId, "goods", false);
    expect(brain.mutedSlugs).toEqual([]);
  });

  it("다른 가치를 건드리지 않는다", async () => {
    await setValueMuted(userId, "goods", true);
    const brain = await setValueMuted(userId, "trend", true);
    expect(brain.mutedSlugs).toEqual(
      expect.arrayContaining(["goods", "trend"]),
    );
    expect(brain.mutedSlugs).toHaveLength(2);
  });

  it("건드리지 않은 관심의 label을 raw slug로 뭉개지 않는다", async () => {
    // trend에 명시 신호를 쌓아 interests에 오르게 한 다음, 무관한 slug(goods)를
    // 뮤트한다 — 뮤트가 labels 맵 없이 재증류하면 모든 노드의 label이 slug로
    // 덮여쓰인다(distillInterests의 labels[slug] ?? slug 폴백).
    await repo.appendUserSignal({
      userId,
      exhibitionId: "exh_test",
      kind: "reaction_interested",
      slugs: ["trend"],
    });

    const brain = await setValueMuted(userId, "goods", true);

    const trendNode = brain.interests.find((n) => n.key === "trend");
    expect(trendNode).toBeDefined();
    expect(trendNode!.label).toBe(valueLabel("trend"));
    expect(trendNode!.label).not.toBe("trend");
  });
});
