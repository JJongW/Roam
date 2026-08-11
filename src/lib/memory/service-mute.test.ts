import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import {
  clearMutedSlugs,
  recordSignal,
  readBrain,
  setValueMuted,
} from "@/lib/memory/service";
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
    const { brain } = await setValueMuted(userId, "goods", true);
    expect(brain.mutedSlugs).toContain("goods");
  });

  it("두 번 꺼도 중복되지 않는다 — 멱등", async () => {
    await setValueMuted(userId, "goods", true);
    const { brain } = await setValueMuted(userId, "goods", true);
    expect(brain.mutedSlugs!.filter((s) => s === "goods")).toHaveLength(1);
  });

  it("풀면 목록에서 빠진다", async () => {
    await setValueMuted(userId, "goods", true);
    const { brain } = await setValueMuted(userId, "goods", false);
    expect(brain.mutedSlugs).not.toContain("goods");
  });

  it("끈 적 없는 걸 풀어도 조용히 성공한다", async () => {
    const { brain } = await setValueMuted(userId, "goods", false);
    expect(brain.mutedSlugs).toEqual([]);
  });

  it("다른 가치를 건드리지 않는다", async () => {
    await setValueMuted(userId, "goods", true);
    const { brain } = await setValueMuted(userId, "trend", true);
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
      kind: "reaction_must",
      slugs: ["trend"],
    });

    const { brain } = await setValueMuted(userId, "goods", true);

    const trendNode = brain.interests.find((n) => n.key === "trend");
    expect(trendNode).toBeDefined();
    expect(trendNode!.label).toBe(valueLabel("trend"));
    expect(trendNode!.label).not.toBe("trend");
  });

  it("분야(category) 키 관심의 label도 지킨다 — 8가치만 라벨을 주면 절반만 산다", async () => {
    // valueTags 없는 부스는 booth.tags(분야 slug)로 신호가 쌓여서 interests에
    // 분야 키 노드가 섞인다. setValueMuted는 exhibitionId가 없어 분야 라벨을 새로
    // 못 읽으므로, 브레인에 이미 적힌 라벨을 물려주지 않으면 여기가 slug로 깨진다.
    const cats = await repo.listCategories();
    const cat = cats.find((c) => c.name !== c.slug)!;
    const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });

    // recordSignal은 listCategories로 분야 라벨을 채워 브레인에 적어둔다.
    await recordSignal(userId, {
      kind: "reaction_must",
      exhibitionId: exhibitions[0].id,
      slugs: [cat.slug],
    });
    const before = await readBrain(userId);
    expect(before.interests.find((n) => n.key === cat.slug)!.label).toBe(
      cat.name,
    );

    // 무관한 가치(goods)를 껐다 켠다 — 분야 노드는 그대로여야 한다.
    await setValueMuted(userId, "goods", true);
    const { brain } = await setValueMuted(userId, "goods", false);

    const catNode = brain.interests.find((n) => n.key === cat.slug);
    expect(catNode).toBeDefined();
    expect(catNode!.label).toBe(cat.name);
    expect(catNode!.label).not.toBe(cat.slug);
  });

  // needsSeed는 서버만 판단할 수 있다 — 뮤트된 가치는 interests에서 빠져 내려가서
  // 클라 쪽 값은 항상 0이라, 클라가 판단하면 이력 있는 가치도 매번 신호가 더 쌓인다.
  describe("needsSeed", () => {
    it("쌓인 게 없는 가치를 풀면 true — 뮤트만 풀면 여전히 0이라 화면이 안 변한다", async () => {
      await setValueMuted(userId, "goods", true);
      const { needsSeed, brain } = await setValueMuted(userId, "goods", false);
      expect(needsSeed).toBe(true);
      expect(brain.interests.find((n) => n.key === "goods")).toBeUndefined();
    });

    it("이력이 있는 가치를 풀면 false — 되살아난 confidence가 있으니 또 안 남긴다", async () => {
      await repo.appendUserSignal({
        userId,
        exhibitionId: "exh_test",
        kind: "reaction_must",
        slugs: ["goods"],
      });
      await setValueMuted(userId, "goods", true);

      const { needsSeed, brain } = await setValueMuted(userId, "goods", false);
      expect(needsSeed).toBe(false);
      expect(
        brain.interests.find((n) => n.key === "goods")!.confidence,
      ).toBeGreaterThan(0);
    });

    it("끈 적 없는 걸 풀어도 이력이 있으면 false", async () => {
      await repo.appendUserSignal({
        userId,
        exhibitionId: "exh_test",
        kind: "reaction_must",
        slugs: ["goods"],
      });
      const { needsSeed } = await setValueMuted(userId, "goods", false);
      expect(needsSeed).toBe(false);
    });

    it("끌 때는 언제나 false — 이력이 없어도", async () => {
      const { needsSeed } = await setValueMuted(userId, "goods", true);
      expect(needsSeed).toBe(false);
    });

    it("끌 때는 언제나 false — 이력이 있어도", async () => {
      await repo.appendUserSignal({
        userId,
        exhibitionId: "exh_test",
        kind: "reaction_must",
        slugs: ["goods"],
      });
      const { needsSeed } = await setValueMuted(userId, "goods", true);
      expect(needsSeed).toBe(false);
    });
  });
});

// 명시적으로 고른 가치는 뮤트를 뚫고 살아나야 한다 — 안 그러면 재증류가 방금 남긴
// 신호를 도로 걸러내서 "골랐는데 아무 일도 안 일어난다"가 된다.
describe("clearMutedSlugs", () => {
  const repo = new MockRepository();
  let userId: string;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore =
      undefined;
    const user = await repo.createUser("tester");
    userId = user.id;
  });

  it("넘긴 slug의 뮤트를 푼다", async () => {
    await setValueMuted(userId, "goods", true);
    await clearMutedSlugs(userId, ["goods"]);
    expect((await readBrain(userId)).mutedSlugs).not.toContain("goods");
  });

  it("안 넘긴 slug의 뮤트는 그대로 둔다", async () => {
    await setValueMuted(userId, "goods", true);
    await setValueMuted(userId, "trend", true);
    await clearMutedSlugs(userId, ["goods"]);
    expect((await readBrain(userId)).mutedSlugs).toEqual(["trend"]);
  });

  it("뮤트가 없으면 브레인을 건드리지 않는다 — 무의미한 version 증가 방지", async () => {
    await setValueMuted(userId, "trend", true);
    const before = await readBrain(userId);
    await clearMutedSlugs(userId, ["goods"]);
    expect(await readBrain(userId)).toEqual(before);
  });

  it("뮤트 해제 + 명시 신호를 함께 태우면 관심으로 되살아난다", async () => {
    await setValueMuted(userId, "goods", true);
    const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });

    // POST /api/me/values 핸들러가 하는 순서 그대로.
    await clearMutedSlugs(userId, ["goods"]);
    await recordSignal(userId, {
      kind: "reaction_must",
      exhibitionId: exhibitions[0].id,
      slugs: ["goods"],
    });

    const brain = await readBrain(userId);
    expect(brain.mutedSlugs).not.toContain("goods");
    expect(brain.interests.find((n) => n.key === "goods")).toBeDefined();
  });
});
