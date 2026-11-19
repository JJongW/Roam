// 하루 한 편 아티클 초안 — 고르고(select), 쓰고(LLM 또는 틀), 게이트를 넘은 판본만 draft로 저장한다.
//
// 워커의 검수 적체 점검(worker/sweep.ts, 매일 09:30)이 보고 직전에 부르고, 관리자 화면의
// "새 초안" 버튼은 잡 큐(article_draft)로 워커에 맡긴다. 실행 위치가 달라도 이 함수 하나다.
//
// 아무것도 공개하지 않는다. 저장은 draft뿐이고, 공개는 Ted의 승인(decision.ts)만 한다.
import type { Repository } from "@/lib/repositories/types";
import type { Article, ArticleBlock, ArticleGate, ArticleKind } from "@/lib/types";
import { todayISO } from "@/lib/exhibition/current";
import { composeTemplate, type Draft } from "./compose";
import { checkArticle } from "./gate";
import { pickCandidates, type Candidate } from "./select";
import type { World } from "./facts";

/** LLM 글쓴이가 돌려주는 판본. 인용은 출처 id만 받고 글은 원문에서 채운다(한 글자도 못 바꾸게). */
export interface LlmDraft {
  title: string;
  excerpt: string;
  blocks: ({ type: "paragraph" | "heading"; text: string; sourceIds: string[] } | { type: "quote"; sourceId: string })[];
}
export type LlmWriter = (input: { template: Draft }) => Promise<LlmDraft>;

export interface GenerateOptions {
  /** KST YYYY-MM-DD. 기본은 오늘. */
  today?: string;
  /** 오늘 이미 만든 편이 있어도 하나 더(관리자 "새 초안"). */
  force?: boolean;
  kind?: ArticleKind;
  /** 없으면 틀 글쓴이만. */
  llm?: LlmWriter;
  /** 저장하지 않고 판본만 돌려준다(드라이런). */
  dryRun?: boolean;
}

export type GenerateResult =
  | { status: "created"; article: Article; draft: Draft; tried: number }
  | { status: "dry-run"; draft: Draft; gate: ArticleGate; tried: number }
  | { status: "exists"; article: Article }
  | { status: "no-subject" }
  | { status: "gate-failed"; attempts: { subjectKey: string; writer: string; issues: string[] }[] };

/** 저장소에서 고르는 데 필요한 것만 읽는다. 부스 번호는 후보가 정해진 뒤 그 행사만. */
export async function loadWorld(repo: Repository, today: string): Promise<World> {
  const [exhibitions, graph, fields] = await Promise.all([
    repo.listExhibitions({ limit: 500 }),
    repo.loadExhibitorGraph(),
    repo.listProfileFields(),
  ]);
  return {
    today,
    exhibitions: exhibitions.data.map((e) => ({
      id: e.id,
      slug: e.slug,
      name: e.name,
      venue: e.venue,
      startDate: e.startDate,
      endDate: e.endDate,
    })),
    graph,
    fields,
  };
}

async function withBoothCodes(repo: Repository, world: World, c: Candidate): Promise<World> {
  const exhibitionIds =
    c.kind === "fair_roundup" ? [c.exhibition.id] : [...new Set(c.brand.participations.map((p) => p.exhibitionId))];
  const lists = await Promise.all(exhibitionIds.map((id) => repo.listBoothsByExhibitionId(id)));
  const boothCodes: Record<string, string> = {};
  for (const b of lists.flat()) if (b.code) boothCodes[b.id] = b.code;
  return { ...world, boothCodes };
}

/** 같은 후보를 부스 번호까지 넣어 다시 만든다(select는 부스 없이 골랐다). */
function refresh(world: World, c: Candidate, articles: Pick<Article, "kind" | "createdAt" | "subjectKey">[]): Candidate {
  const again = pickCandidates(world, articles.filter((a) => a.subjectKey !== c.subjectKey), { kind: c.kind, limit: 10_000 });
  return again.find((x) => x.subjectKey === c.subjectKey) ?? c;
}

export function fromLlm(template: Draft, out: LlmDraft, writer: string): Draft {
  const quotes = new Map(
    template.body.filter((b): b is Extract<ArticleBlock, { type: "quote" }> => b.type === "quote").map((b) => [b.sourceId, b]),
  );
  const sources = new Map(template.sources.map((s) => [s.id, s]));
  const body: ArticleBlock[] = out.blocks.map((b) => {
    if (b.type !== "quote") return { type: b.type, text: b.text.trim(), sourceIds: b.sourceIds };
    const q = quotes.get(b.sourceId);
    if (q) return q;
    // 틀에 없던 인용이면 원문 전체를 그대로. 브랜드가 쓴 글이 아니면 게이트가 막는다.
    return { type: "quote", text: sources.get(b.sourceId)?.text ?? "", sourceId: b.sourceId, attribution: "원문" };
  });
  return { ...template, title: out.title.trim(), excerpt: out.excerpt.trim(), body, writer };
}

const gateOf = (d: Draft) =>
  checkArticle({
    title: d.title,
    excerpt: d.excerpt,
    body: d.body,
    sources: d.sources,
    protectedTerms: d.protectedTerms,
    derivedNumbers: d.derivedNumbers,
  });

export async function generateDailyArticle(repo: Repository, opts: GenerateOptions = {}): Promise<GenerateResult> {
  const today = opts.today ?? todayISO();
  const articles = await repo.listArticles({ limit: 1000 });
  if (!opts.force && !opts.dryRun) {
    const done = articles.find((a) => a.generatedFor === today);
    if (done) return { status: "exists", article: done };
  }

  const world = await loadWorld(repo, today);
  const candidates = pickCandidates(world, articles, { kind: opts.kind });
  if (candidates.length === 0) return { status: "no-subject" };

  const attempts: { subjectKey: string; writer: string; issues: string[] }[] = [];
  for (const [i, picked] of candidates.entries()) {
    const full = refresh(await withBoothCodes(repo, world, picked), picked, articles);
    const template = composeTemplate(full, world.fields);
    const rejected: ArticleGate["rejectedAttempts"] = [];

    // LLM 판본을 먼저, 못 넘으면 틀 판본. 둘 다 못 넘으면 다음 후보.
    const versions: (() => Promise<Draft>)[] = [];
    if (opts.llm) versions.push(async () => fromLlm(template, await opts.llm!({ template }), "llm"));
    versions.push(async () => template);

    for (const make of versions) {
      let draft: Draft;
      try {
        draft = await make();
      } catch (e) {
        const issue = `글쓴이 오류: ${e instanceof Error ? e.message : String(e)}`;
        rejected.push({ writer: "llm", issues: [issue] });
        attempts.push({ subjectKey: picked.subjectKey, writer: "llm", issues: [issue] });
        continue;
      }
      const g = gateOf(draft);
      if (!g.ok) {
        rejected.push({ writer: draft.writer, issues: g.issues });
        attempts.push({ subjectKey: picked.subjectKey, writer: draft.writer, issues: g.issues });
        continue;
      }
      const gate: ArticleGate = { ok: true, writer: draft.writer, issues: [], rejectedAttempts: rejected, checkedAt: new Date().toISOString() };
      if (opts.dryRun) return { status: "dry-run", draft, gate, tried: i + 1 };
      const article = await repo.createArticle({
        kind: draft.kind,
        title: draft.title,
        excerpt: draft.excerpt,
        body: draft.body,
        sources: draft.sources,
        gate,
        subjectKey: draft.subjectKey,
        exhibitorIds: draft.exhibitorIds,
        exhibitionIds: draft.exhibitionIds,
        generatedFor: today,
      });
      // null = 그사이 같은 주제가 열렸다(동시 실행). 다음 후보로.
      if (article) return { status: "created", article, draft, tried: i + 1 };
      break;
    }
  }
  return { status: "gate-failed", attempts };
}

/** 슬랙과 로그에 남길 한 줄. 만들었으면 null(초안 자체가 보고된다). */
export function generationNote(r: GenerateResult | { status: "error"; message: string }): string | null {
  switch (r.status) {
    case "created":
    case "exists":
    case "dry-run":
      return null;
    case "no-subject":
      return "오늘은 새 초안을 만들지 않았어요. 확인된 사실이 넉넉한 새 주제가 없어요.";
    case "gate-failed":
      return `오늘은 새 초안을 만들지 않았어요. 후보 ${new Set(r.attempts.map((a) => a.subjectKey)).size}곳이 모두 말투나 근거 검사를 넘지 못했어요.`;
    case "error":
      return `아티클 초안 만들기가 실패했어요: ${r.message.slice(0, 200)}`;
  }
}
