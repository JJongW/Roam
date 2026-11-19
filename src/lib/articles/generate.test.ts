import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { Exhibition } from "@/lib/types";
import { decideArticle, publicArticle, transition } from "./decision";
import { generateArticle, generationNote, type LlmWriter } from "./generate";
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
  for (const [participantId, perm] of Object.entries(w.permissions ?? {}))
    await repo.upsertParticipantPermission(participantId, { status: perm.status, allowedUse: perm.allowedUse }, "test");
  return repo;
}

let repo: MockRepository;
beforeEach(async () => {
  repo = await seeded();
});

describe("generateArticle", () => {
  it("한 편을 draft로 저장하고, 같은 날 다시 돌면 새로 만들지 않는다", async () => {
    const r = await generateArticle(repo, { today: TODAY });
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.article).toMatchObject({ status: "draft", kind: "brand_intro", subjectKey: "brand:ex_hachi", generatedFor: TODAY });
    expect(r.article.gate).toMatchObject({ ok: true, writer: "template", issues: [] });
    expect(r.article.sources.length).toBeGreaterThan(0);
    expect(r.article.exhibitorIds).toEqual(["ex_hachi"]);

    const again = await generateArticle(repo, { today: TODAY });
    expect(again.status).toBe("exists");
    expect(await repo.listArticles()).toHaveLength(1);
  });

  it("다음 주 편은 종류를 바꿔 박람회 모음을 만든다", async () => {
    await generateArticle(repo, { today: TODAY });
    const r = await generateArticle(repo, { today: "2026-11-23" });
    expect(r.status === "created" && r.article.kind).toBe("fair_roundup");
  });

  it("반려한 주제는 다음 초안에서 피한다", async () => {
    const r = await generateArticle(repo, { today: TODAY, kind: "brand_intro" });
    if (r.status !== "created") throw new Error(r.status);
    await decideArticle(repo, r.article.id, "reject", "ted@example.com", "사진 허락 전이에요");
    const next = await generateArticle(repo, { today: "2026-11-23", kind: "brand_intro" });
    expect(next.status === "created" && next.article.subjectKey).toBe("brand:ex_gusan");
  });

  it("LLM 판본이 게이트를 못 넘으면 틀 판본으로 저장하고, 버린 판본을 기록한다", async () => {
    const llm: LlmWriter = async ({ template }) => ({
      title: template.title,
      excerpt: "꼭 가 보세요. 최고의 브랜드입니다.",
      blocks: [
        { type: "text", text: "올해 1000개를 판 브랜드입니다.", sourceIds: [template.sources[0].id] },
        ...template.body.flatMap((b, index) => (b.type === "photo" || b.type === "photo-group" ? [{ type: "keep" as const, index }] : [])),
      ],
    });
    const r = await generateArticle(repo, { today: TODAY, llm });
    if (r.status !== "created") throw new Error(r.status);
    expect(r.article.gate.writer).toBe("template");
    expect(r.article.gate.rejectedAttempts[0].writer).toBe("llm");
    expect(r.article.gate.rejectedAttempts[0].issues.join()).toMatch(/합니다체|단정|과장|1000/);
  });

  it("LLM 판본이 사진을 빠뜨리면 그 판본은 버리고 틀 판본을 쓴다(모델은 사진을 고르거나 뺄 수 없다)", async () => {
    const llm: LlmWriter = async ({ template }) => ({
      title: template.title,
      excerpt: template.excerpt,
      blocks: [template.body.find((b) => b.type === "text") as never],
    });
    const r = await generateArticle(repo, { today: TODAY, llm });
    if (r.status !== "created") throw new Error(r.status);
    expect(r.article.gate.writer).toBe("template");
    expect(r.article.gate.rejectedAttempts[0].issues.join()).toContain("사진이나 브랜드 카드를 빠뜨렸어요");
    expect(r.article.body.some((b) => b.type === "photo-group")).toBe(true);
  });

  it("저장된 초안엔 늘 허락 받은 대표 사진이 있다", async () => {
    const r = await generateArticle(repo, { today: TODAY });
    if (r.status !== "created") throw new Error(r.status);
    expect(r.article.hero).toMatchObject({ path: "/articles/test/hachi_1.webp", permissionId: "perm:pt_hachi_ny" });
  });

  it("허락 받은 사진이 하나도 없으면 아무것도 저장하지 않는다", async () => {
    (globalThis as unknown as { __roamStore: { participantPermissions: unknown[] } }).__roamStore.participantPermissions = [];
    expect((await generateArticle(repo, { today: TODAY })).status).toBe("no-subject");
    expect(await repo.listArticles()).toEqual([]);
  });

  it("LLM 판본의 인용은 원문에서 채운다(모델이 인용을 고칠 수 없다)", async () => {
    const llm: LlmWriter = async ({ template }) => {
      const quote = template.body.find((b) => b.type === "quote")!;
      const lead = template.body.find((b) => b.type === "text")!;
      const photo = template.body.findIndex((b) => b.type === "photo-group" || b.type === "photo");
      return {
        title: template.title,
        excerpt: template.excerpt,
        blocks: [lead as never, { type: "quote", sourceId: (quote as { sourceId: string }).sourceId }, { type: "keep", index: photo }],
      };
    };
    const r = await generateArticle(repo, { today: TODAY, llm });
    if (r.status !== "created") throw new Error(r.status);
    expect(r.article.gate.writer).toBe("llm");
    const q = r.article.body.find((b) => b.type === "quote")!;
    expect(r.article.sources.find((s) => s.id === (q as { sourceId: string }).sourceId)!.text).toBe(q.text);
  });

  it("고를 주제가 없으면 아무것도 저장하지 않는다", async () => {
    (globalThis as unknown as { __roamStore: Store }).__roamStore.profileFields = [];
    expect((await generateArticle(repo, { today: TODAY })).status).toBe("no-subject");
    expect(await repo.listArticles()).toEqual([]);
  });

  it("드라이런은 저장하지 않는다", async () => {
    const r = await generateArticle(repo, { today: TODAY, dryRun: true });
    expect(r.status).toBe("dry-run");
    expect(await repo.listArticles()).toEqual([]);
  });
});

// 2026-11-19 Ted: 자동 초안은 한 주에 한 편, 월요일(KST). 2026-11-23, 11-30이 월요일이다.
describe("한 주에 한 편 — 월요일, 놓치면 따라잡기", () => {
  const MON = "2026-11-23";
  const REST = ["2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];

  it("월요일에 만들고, 화요일부터 일요일까지는 새로 만들지 않는다", async () => {
    const r = await generateArticle(repo, { today: MON });
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.article).toMatchObject({ generatedFor: MON, gate: { origin: "schedule" } });
    for (const day of REST) {
      const again = await generateArticle(repo, { today: day });
      expect(again.status, day).toBe("exists");
      expect(generationNote(again), day).toBeNull(); // 슬랙에 "오늘 초안 없음" 줄이 붙지 않는다
    }
    expect(await repo.listArticles()).toHaveLength(1);
    expect((await generateArticle(repo, { today: "2026-11-30" })).status).toBe("created");
  });

  it("월요일을 놓쳐 이번 주 편이 없으면 다음 점검(수요일)이 만들고, 그 주 남은 날은 쉰다", async () => {
    await generateArticle(repo, { today: "2026-11-16" }); // 지난주 월요일 편
    const r = await generateArticle(repo, { today: "2026-11-25" }); // 9일 만의 점검
    expect(r.status === "created" && r.article.generatedFor).toBe("2026-11-25");
    expect((await generateArticle(repo, { today: "2026-11-26" })).status).toBe("exists");
    // 따라잡은 주가 끝나면 다시 월요일로 돌아온다(수요일로 밀리지 않는다).
    expect((await generateArticle(repo, { today: "2026-11-30" })).status).toBe("created");
  });

  it("반려한 편도 그 주 몫으로 센다", async () => {
    const r = await generateArticle(repo, { today: MON });
    if (r.status !== "created") throw new Error(r.status);
    await decideArticle(repo, r.article.id, "reject", "ted@example.com");
    expect((await generateArticle(repo, { today: "2026-11-24" })).status).toBe("exists");
  });

  it("관리자 \"새 초안\"(force)은 주간 셈에 들어가지 않는다", async () => {
    const manual = await generateArticle(repo, { today: MON, force: true });
    expect(manual.status === "created" && manual.article.gate.origin).toBe("manual");
    const auto = await generateArticle(repo, { today: MON });
    expect(auto.status === "created" && auto.article.gate.origin).toBe("schedule");
  });

  it("이번 주 편을 아직 못 만든 날의 한 줄은 \"이번 주\"로 말한다", () => {
    expect(generationNote({ status: "gate-failed", attempts: [{ subjectKey: "brand:x", writer: "template", issues: [] }] })).toBe(
      "이번 주 초안을 아직 만들지 못했어요. 후보 1곳이 모두 말투나 근거 검사를 넘지 못했어요. 내일 점검에서 다시 해 볼게요.",
    );
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
    const r = await generateArticle(repo, { today: TODAY });
    if (r.status !== "created") throw new Error(r.status);
    const a = await decideArticle(repo, r.article.id, "approve", "slack:U1", "무시되는 이유");
    expect(a.ok && a.article).toMatchObject({ status: "approved", decidedBy: "slack:U1", rejectReason: null });
    expect(a.ok && a.article.decidedAt).toBeTruthy();
    const b = await decideArticle(repo, r.article.id, "reject", "ted@example.com");
    expect(b).toMatchObject({ ok: false, reason: "not-draft", article: { status: "approved" } });
    expect(await decideArticle(repo, "nope", "approve", null)).toEqual({ ok: false, reason: "not-found" });
  });

  it("반려 이유는 선택이고 저장된다", async () => {
    const r = await generateArticle(repo, { today: TODAY });
    if (r.status !== "created") throw new Error(r.status);
    const x = await decideArticle(repo, r.article.id, "reject", "ted@example.com", "  ");
    expect(x.ok && x.article.rejectReason).toBeNull();
  });

  it("공개 모양에는 게이트, 결정한 사람, 반려 이유, 내부 출처 주소가 없다", async () => {
    const r = await generateArticle(repo, { today: TODAY });
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
