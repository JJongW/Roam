import type { Metadata } from "next";
import { SurveyForm } from "@/components/survey/survey-form";

/**
 * 공개 설문 — 링크를 받은 누구나 **로그인 없이** 답한다(`src/proxy.ts` PUBLIC_PATHS).
 * 질문은 `lib/survey/questions.ts`, 저장은 `POST /api/survey`, 결과는 `/admin/survey`.
 * 결정: docs/decisions/2026-10-16_공개-설문-페이지.md
 */
const TITLE = "박람회에서 부스 못 찾고 헤맨 적 있으세요?";
const DESCRIPTION = "코엑스·세텍 박람회에서 쓸 부스 지도 앱을 만들고 있는데, 1분만 도와주세요!";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // 링크를 붙여 넣었을 때 미리보기에 뜨는 문장 — 누를지 말지가 여기서 갈린다.
  openGraph: { title: TITLE, description: DESCRIPTION },
  twitter: { title: TITLE, description: DESCRIPTION },
  robots: { index: false },
};

export default function SurveyPage() {
  return (
    <main
      id="main"
      className="mx-auto w-full max-w-xl px-[var(--spacing-global-gutter)] pb-16 pt-[calc(env(safe-area-inset-top)+2rem)]"
    >
      <header className="mb-6">
        <p className="text-sm font-semibold text-primary">Roam</p>
        <h1 className="mt-1 text-2xl font-bold leading-snug text-balance">{TITLE}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{DESCRIPTION}</p>
      </header>
      <SurveyForm />
    </main>
  );
}
