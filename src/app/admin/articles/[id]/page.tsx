import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { STATUS_LABEL } from "@/lib/articles/decision";
import { KIND_LABEL } from "@/lib/articles/slack";
import { verifyArticleAction, type ArticleAction } from "@/lib/articles/signed-link";
import { ArticleView } from "@/components/admin/articles/article-view";
import { DecisionPanel } from "@/components/admin/articles/decision-panel";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string; exp?: string; sig?: string }>;
};

const LINK_PROBLEM = {
  "no-secret": "링크 서명을 확인할 수 없어요(ARTICLE_LINK_SECRET 없음). 아래 버튼으로 결정할 수 있어요.",
  malformed: "링크가 온전하지 않아요. 아래 버튼으로 결정할 수 있어요.",
  expired: "링크가 만료됐어요(7일). 아래 버튼으로 결정할 수 있어요.",
  "bad-signature": "링크 서명이 맞지 않아요. 아래 버튼으로 결정할 수 있어요.",
} as const;

/**
 * 아티클 미리보기와 결정. 관리자 레이아웃이 로그인을 먼저 요구한다(슬랙 링크도 여기로 온다).
 * 서명 링크(?action&exp&sig)는 확인 문구만 띄운다 — 상태는 DecisionPanel의 POST로만 바뀐다.
 */
export default async function AdminArticlePage({ params, searchParams }: Props) {
  const { id } = await params;
  const q = await searchParams;
  const repo = await getRepository();
  const article = await repo.getArticle(id);
  if (!article) notFound();

  let intent: ArticleAction | null = null;
  let linkProblem: string | null = null;
  if (q.action || q.sig) {
    const v = verifyArticleAction(process.env.ARTICLE_LINK_SECRET, { id, action: q.action, exp: q.exp, sig: q.sig });
    if (v.ok) intent = q.action as ArticleAction;
    else linkProblem = LINK_PROBLEM[v.reason];
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/articles" className="text-sm text-muted-foreground underline">
        아티클 목록
      </Link>
      <p className="text-xs text-muted-foreground">
        {STATUS_LABEL[article.status]}, {KIND_LABEL[article.kind]}, {article.generatedFor}, 글쓴이 {article.gate.writer}
        {article.decidedAt ? `, ${article.decidedBy ?? "알 수 없음"} ${article.decidedAt.slice(0, 16).replace("T", " ")}` : ""}
      </p>
      {article.status === "draft" ? (
        <DecisionPanel id={article.id} intent={intent} linkProblem={linkProblem} />
      ) : (
        <p className="rounded-xl border border-border p-3 text-sm">
          이미 결정된 글이에요({STATUS_LABEL[article.status]}).
          {article.rejectReason ? ` 반려 이유: ${article.rejectReason}` : ""}
        </p>
      )}
      <ArticleView article={article} />
      {article.gate.rejectedAttempts.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary>게이트에서 버린 판본 {article.gate.rejectedAttempts.length}개</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {article.gate.rejectedAttempts.map((r, i) => (
              <li key={i}>
                {r.writer}: {r.issues.slice(0, 5).join(" / ")}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
