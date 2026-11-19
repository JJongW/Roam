import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { Exhibition } from "@/lib/types";
import { decideArticle, publicArticle, transition } from "./decision";
import { generateDailyArticle, type LlmWriter } from "./generate";
import { TODAY, world } from "./__fixtures__";

type Store = { exhibitions: Exhibition[]; exhibitorGraph: unknown; profileFields: unknown[] };

/** 목 저장소에 고정 세계를 심는다. 공개 메서드로는 행사와 칸을 이 모양으로 넣을 길이 길어 store를 직접 채운다. */
async function seeded(): Promise<MockRepository> {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  const repo = new MockRepository();
  await repo.listJobs(); // store 초기화
  const st = (globalThis as unknown as { __roamStore: Store }).__roamStore;
  const w = world();
  st.exhibitions = w.exhibitions.map((e) => ({ ...e, description: "", mapWidth: 0, mapHeight: 0, tips: {}, createdAt: "2026-11-01T00:00:00Z" }));
  st.exhibitorGraph = w.graph;
  st.profileFields = w.fields;
  return repo;
}

let repo: MockRepository;
beforeEach(async () => {
  repo = await seeded();
});

describe("generateDailyArticle", () => {
  it("하루 한 편을 draft로 저장하고, 같은 날 다시 돌면 새로 만들지 않는다", async () => {
    const r = await generateDailyArticle(repo, { today: TODAY });
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.article).toMatchObject({ status: "draft", kind: "brand_intro", subjectKey: "brand:ex_hachi", generatedFor: TODAY });
    expect(r.article.gate).toMatchObject({ ok: true, writer: "template", issues: [] });
    expect(r.article.sources.length).toBeGreaterThan(0);
    expect(r.article.exhibitorIds).toEqual(["ex_hachi"]);

    const again = await generateDailyArticle(repo, { today: TODAY });
    expect(again.status).toBe("exists");
    expect(await repo.listArticles()).toHaveLength(1);
  });

  it("다음 날은 종류를 바꿔 박람회 모음을 만든다", async () => {
    await generateDailyArticle(repo, { today: TODAY });
    const r = await generateDailyArticle(repo, { today: "2026-11-20" });
    expect(r.status === "created" && r.article.kind).toBe("fair_roundup");
  });

  it("반려한 주제는 다음 초안에서 피한다", async () => {
    const r = await generateDailyArticle(repo, { today: TODAY, kind: "brand_intro" });
    if (r.status !== "created") throw new Error(r.status);
    await decideArticle(repo, r.article.id, "reject", "ted@example.com", "사진 허락 전이에요");
    const next = await generateDailyArticle(repo, { today: "2026-11-20", kind: "brand_intro" });
    expect(next.status === "created" && next.article.subjectKey).toBe("brand:ex_gusan");
  });

  it("LLM 판본이 게이트를 못 넘으면 틀 판본으로 저장하고, 버린 판본을 기록한다", async () => {
    const llm: LlmWriter = async ({ template }) => ({
      title: template.title,
      excerpt: "꼭 가 보세요. 최고의 브랜드입니다.",
      blocks: [{ type: "paragraph", text: "올해 1000개를 판 브랜드입니다.", sourceIds: [template.sources[0].id] }],
    });
    const r = await generateDailyArticle(repo, { today: TODAY, llm });
    if (r.status !== "created") throw new Error(r.status);
    expect(r.article.gate.writer).toBe("template");
    expect(r.article.gate.rejectedAttempts[0].writer).toBe("llm");
    expect(r.article.gate.rejectedAttempts[0].issues.join()).toMatch(/합니다체|단정|과장|1000/);
  });

  it("LLM 판본의 인용은 원문에서 채운다(모델이 인용을 고칠 수 없다)", async () => {
    const llm: LlmWriter = async ({ template }) => {
      const quote = template.body.find((b) => b.type === "quote")!;
      const lead = template.body.find((b) => b.type === "paragraph")!;
      return {
        title: template.title,
        excerpt: template.excerpt,
        blocks: [lead as never, { type: "quote", sourceId: (quote as { sourceId: string }).sourceId }],
      };
    };
    const r = await generateDailyArticle(repo, { today: TODAY, llm });
    if (r.status !== "created") throw new Error(r.status);
    expect(r.article.gate.writer).toBe("llm");
    const q = r.article.body.find((b) => b.type === "quote")!;
    expect(r.article.sources.find((s) => s.id === (q as { sourceId: string }).sourceId)!.text).toBe(q.text);
  });

  it("고를 주제가 없으면 아무것도 저장하지 않는다", async () => {
    (globalThis as unknown as { __roamStore: Store }).__roamStore.profileFields = [];
    expect((await generateDailyArticle(repo, { today: TODAY })).status).toBe("no-subject");
    expect(await repo.listArticles()).toEqual([]);
  });

  it("드라이런은 저장하지 않는다", async () => {
    const r = await generateDailyArticle(repo, { today: TODAY, dryRun: true });
    expect(r.status).toBe("dry-run");
    expect(await repo.listArticles()).toEqual([]);
  });
});

describe("승인과 반려 — 상태 기계", () => {
  it("draft만 바뀐다", () => {
    expect(transition("draft", "approve")).toEqual({ ok: true, next: "approved" });
    expect(transition("draft", "reject")).toEqual({ ok: true, next: "rejected" });
    expect(transition("approved", "reject")).toEqual({ ok: false, reason: "not-draft" });
    expect(transition("rejected", "approve")).toEqual({ ok: false, reason: "not-draft" });
  });

  it("승인은 누가, 언제를 남기고, 두 번째 결정은 아무것도 바꾸지 않는다", async () => {
    const r = await generateDailyArticle(repo, { today: TODAY });
    if (r.status !== "created") throw new Error(r.status);
    const a = await decideArticle(repo, r.article.id, "approve", "slack:U1", "무시되는 이유");
    expect(a.ok && a.article).toMatchObject({ status: "approved", decidedBy: "slack:U1", rejectReason: null });
    expect(a.ok && a.article.decidedAt).toBeTruthy();
    const b = await decideArticle(repo, r.article.id, "reject", "ted@example.com");
    expect(b).toMatchObject({ ok: false, reason: "not-draft", article: { status: "approved" } });
    expect(await decideArticle(repo, "nope", "approve", null)).toEqual({ ok: false, reason: "not-found" });
  });

  it("반려 이유는 선택이고 저장된다", async () => {
    const r = await generateDailyArticle(repo, { today: TODAY });
    if (r.status !== "created") throw new Error(r.status);
    const x = await decideArticle(repo, r.article.id, "reject", "ted@example.com", "  ");
    expect(x.ok && x.article.rejectReason).toBeNull();
  });

  it("공개 모양에는 게이트, 결정한 사람, 반려 이유, 내부 출처 주소가 없다", async () => {
    const r = await generateDailyArticle(repo, { today: TODAY });
    if (r.status !== "created") throw new Error(r.status);
    const a = await decideArticle(repo, r.article.id, "approve", "ted@example.com");
    if (!a.ok) throw new Error();
    const p = publicArticle(a.article);
    expect(p).not.toHaveProperty("gate");
    expect(p).not.toHaveProperty("decidedBy");
    expect(JSON.stringify(p.sources)).not.toContain("roam:");
    expect(p.publishedAt).toBe(a.article.decidedAt);
  });
});
