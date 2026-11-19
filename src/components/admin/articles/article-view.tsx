import type { ReactNode } from "react";
import type { Article, ArticlePhoto } from "@/lib/types";

function PhotoFigure({ photo, className, refNode }: { photo: ArticlePhoto; className?: string; refNode: ReactNode }) {
  return (
    <figure className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element -- 허락 받은 원본 그대로, 최적화 없이 */}
      <img src={photo.path} alt={photo.alt} loading="lazy" className="aspect-[3/4] w-full rounded-xl bg-secondary object-cover" />
      <figcaption className="mt-1 text-[11px] text-muted-foreground">
        {photo.credit}
        <span className="ml-1">(허락 범위: {photo.scope})</span>
        {refNode}
      </figcaption>
    </figure>
  );
}

/**
 * 아티클 본문 미리보기. 인용(브랜드 원문)은 Roam이 쓴 문단과 눈에 띄게 다르게 보여 준다.
 * 사진은 허락 받은 것만 들어오며, 사진마다 표기와 허락 범위를 함께 보여 줘 승인 전에 확인하게 한다.
 */
export function ArticleView({ article }: { article: Pick<Article, "title" | "excerpt" | "hero" | "body" | "sources"> }) {
  const index = new Map(article.sources.map((s, i) => [s.id, i + 1]));
  const refs = (ids: string[]) =>
    ids.length ? <sup className="ml-1 text-[11px] text-muted-foreground">[{ids.map((id) => index.get(id) ?? "?").join(", ")}]</sup> : null;
  const photoEl = ({ photo, className }: { photo: ArticlePhoto; className?: string }) =>
    PhotoFigure({ photo, className, refNode: refs([photo.sourceId, photo.permissionId]) });
  return (
    <article className="space-y-4">
      {article.hero ? (
        photoEl({ photo: article.hero })
      ) : (
        <p className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">대표 사진이 없어요. 이 초안은 공개하면 안 돼요.</p>
      )}
      <h2 className="text-xl font-extrabold">{article.title}</h2>
      <p className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">{article.excerpt}</p>
      {article.body.map((b, i) => {
        switch (b.type) {
          case "quote":
            return (
              <figure key={i} className="border-l-4 border-primary/50 pl-4">
                <blockquote className="whitespace-pre-line text-sm">{b.text}</blockquote>
                <figcaption className="mt-1 text-xs text-muted-foreground">
                  인용: {b.attribution}
                  {refs([b.sourceId])}
                </figcaption>
              </figure>
            );
          case "photo":
            return <div key={i}>{photoEl({ photo: b.photo })}</div>;
          case "photo-group":
            return (
              <div key={i} className="grid grid-cols-2 gap-2">
                {b.photos.map((p, j) => (
                  <div key={j}>{photoEl({ photo: p })}</div>
                ))}
              </div>
            );
          case "brand-card":
            return (
              <section key={i} className="flex gap-3 rounded-2xl border border-border p-3">
                {photoEl({ photo: b.photo, className: "w-28 shrink-0" })}
                <div className="min-w-0 space-y-1">
                  <h3 className="text-base font-bold">
                    {b.name}
                    {refs(b.sourceIds)}
                  </h3>
                  {b.boothCode && <p className="text-xs text-muted-foreground">부스 {b.boothCode}</p>}
                  {b.items?.length ? <p className="text-xs">{b.items.join(", ")}</p> : null}
                </div>
              </section>
            );
          default:
            return (
              <p key={i} className="text-sm leading-relaxed">
                {b.text}
                {refs(b.sourceIds)}
              </p>
            );
        }
      })}
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
