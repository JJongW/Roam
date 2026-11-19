import type { Article } from "@/lib/types";

/** 아티클 본문 미리보기. 인용(브랜드 원문)은 Roam이 쓴 문단과 눈에 띄게 다르게 보여 준다. */
export function ArticleView({ article }: { article: Pick<Article, "title" | "excerpt" | "body" | "sources"> }) {
  const index = new Map(article.sources.map((s, i) => [s.id, i + 1]));
  const refs = (ids: string[]) =>
    ids.length ? <sup className="ml-1 text-[11px] text-muted-foreground">[{ids.map((id) => index.get(id) ?? "?").join(", ")}]</sup> : null;
  return (
    <article className="space-y-4">
      <h2 className="text-xl font-extrabold">{article.title}</h2>
      <p className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">{article.excerpt}</p>
      {article.body.map((b, i) =>
        b.type === "heading" ? (
          <h3 key={i} className="pt-2 text-base font-bold">
            {b.text}
            {refs(b.sourceIds)}
          </h3>
        ) : b.type === "quote" ? (
          <figure key={i} className="border-l-4 border-primary/50 pl-4">
            <blockquote className="whitespace-pre-line text-sm">{b.text}</blockquote>
            <figcaption className="mt-1 text-xs text-muted-foreground">
              인용: {b.attribution}
              {refs([b.sourceId])}
            </figcaption>
          </figure>
        ) : (
          <p key={i} className="text-sm leading-relaxed">
            {b.text}
            {refs(b.sourceIds)}
          </p>
        ),
      )}
      <section className="space-y-1 border-t border-border pt-3">
        <h3 className="text-sm font-bold">출처 {article.sources.length}개</h3>
        <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          {article.sources.map((s) => (
            <li key={s.id}>
              {s.label}
              {s.brandWritten ? " (브랜드가 쓴 글, 인용만)" : ""}
              {s.origin.map((o) =>
                /^https?:\/\//.test(o) ? (
                  <a key={o} href={o} target="_blank" rel="noreferrer" className="ml-1 underline">
                    링크
                  </a>
                ) : (
                  <span key={o} className="ml-1">
                    {o}
                  </span>
                ),
              )}
            </li>
          ))}
        </ol>
      </section>
    </article>
  );
}
