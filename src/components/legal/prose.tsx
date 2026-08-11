import type { ReactNode } from "react";

/**
 * 법적 고지 페이지(개인정보처리방침·서비스 약관)의 공통 조판 요소.
 *
 * 두 페이지는 Google OAuth 인증 제출 대상이라 서로 같은 구조·같은 읽기 경험이어야
 * 한다. 한 곳에서만 문단 간격이 달라져도 심사에서 "다른 사이트의 문서"처럼 보인다.
 */

export function Section({
  id,
  no,
  title,
  children,
}: {
  id?: string;
  no: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-8">
      <h2 className="mb-3 text-lg font-bold tracking-tight sm:text-xl">
        <span className="mr-2 text-muted-foreground tabular-nums">{no}.</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
        {children}
      </div>
    </section>
  );
}

export function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-muted/50">
            {head.map((h) => (
              <th
                key={h}
                scope="col"
                className="border-b border-border px-3 py-2.5 font-semibold text-foreground"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="align-top">
              {r.map((c, j) => (
                <td
                  key={j}
                  className="border-b border-border px-3 py-2.5 last:border-r-0 [tr:last-child_&]:border-b-0"
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 외부 링크 — 새 탭. */
export function Ext({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  );
}

/** 페이지 하단 공통 푸터. */
export function LegalFooter() {
  return (
    <footer className="mt-16 border-t border-border pt-8">
      <p className="text-base font-bold tracking-tight">Roam</p>
      <p className="mt-1 text-sm text-muted-foreground">© 2026 Roam</p>
    </footer>
  );
}
