"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth";
import { useCompanionStore } from "@/lib/stores/companion";
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message";
import { useT } from "@/lib/i18n/provider";
import type { TFn } from "@/lib/i18n/resolve";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * 상주 컴패니언 바 — 방문객 전 화면에 뜨는 Roam 플로팅 필(로고 + 맥락 발화). 탭하면
 * 대화 시트가 열린다. companion-reframe Phase G. 탭 대화엔 LLM 금지(속도 규칙) —
 * 즉답 로컬 템플릿만. 로그인 전(로그인/온보딩 게이트)엔 뜨지 않는다.
 */
export function CompanionBar() {
  const t = useT();
  const pathname = usePathname() ?? "";
  const user = useAuthStore((s) => s.user);
  const home = useCompanionStore((s) => s.home);
  const flash = useCompanionStore((s) => s.flash);
  const clearFlash = useCompanionStore((s) => s.clearFlash);
  const say = useCompanionStore((s) => s.say);
  const progress = useCompanionStore((s) => s.progress);
  const [open, setOpen] = useState(false);
  const doneRef = useRef(false);

  // 즉답(flash)은 잠깐 띄우고 스스로 사라진다 → 맥락 발화로 복귀.
  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(clearFlash, 4500);
    return () => clearTimeout(id);
  }, [flash, clearFlash]);

  // 전시 홈(상세)에선 상단 고정 배너 대신 여기서 취향·개수 맞춤 발화를 회전시킨다.
  const isExhibitionHome = /\/exhibitions\/[^/]+$/.test(pathname);

  // 파악도 100% 도달 = 온보딩 마무리 — 로미가 한 번 선언한다(중복 금지).
  useEffect(() => {
    if (isExhibitionHome && progress >= 100 && !doneRef.current) {
      doneRef.current = true;
      say(t("companion.progressDone"));
    }
  }, [isExhibitionHome, progress, say, t]);
  const lines = useMemo(() => {
    if (isExhibitionHome && home) return homeLines(home, t);
    return [contextLine(pathname, t)];
  }, [isExhibitionHome, home, pathname, t]);
  // 여러 변주면 천천히 돌려 "말이 계속 바뀌는" 동행 느낌(휘발성).
  const rotating = useRotatingMessage(lines, lines.length > 1, 5000);
  // 방금 행동에 대한 즉답이 있으면 그걸 먼저, 없으면 맥락 발화.
  const line = flash ?? rotating;

  // 로그인 사용자 + 방문객 화면에서만. 지도는 자체 전체화면 UI라 겹침 피해 숨김.
  if (!user) return null;
  // 전시 안에 들어와야 동행 맥락이 생긴다 — 홈(전시 목록)·로그인·지도(자체 UI)엔 숨김.
  if (pathname === "/" || pathname.startsWith("/login")) return null;
  if (pathname.endsWith("/map")) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-background/90 py-2 pl-2 pr-4 shadow-[var(--shadow-card)] backdrop-blur-xl active:scale-[0.98]"
        >
          <RoamAvatar />
          {isExhibitionHome && home && progress > 0 && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {progress >= 100
                ? "✓"
                : t("companion.progressLabel", { pct: progress })}
            </span>
          )}
          <span className="truncate text-sm font-semibold">{line}</span>
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-5 pb-8">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <RoamAvatar />
              {t("companion.ask")}
            </SheetTitle>
          </SheetHeader>
          <CompanionChat t={t} />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** 탭 대화 — 정해진 질문에 로컬 템플릿으로 즉답. LLM 없음(속도 규칙). */
function CompanionChat({ t }: { t: TFn }) {
  const [log, setLog] = useState<{ role: "you" | "roam"; text: string }[]>([]);
  const prompts = [
    { q: t("companion.q1"), a: t("companion.a1") },
    { q: t("companion.q2"), a: t("companion.a2") },
    { q: t("companion.q3"), a: t("companion.a3") },
  ];

  function ask(q: { q: string; a: string }) {
    setLog((prev) => [
      ...prev,
      { role: "you", text: q.q },
      { role: "roam", text: q.a },
    ]);
  }

  return (
    <div className="mt-4 space-y-4">
      {log.length > 0 && (
        <div className="space-y-2">
          {log.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "you"
                  ? "ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground"
                  : "mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2 text-sm leading-relaxed"
              }
            >
              {m.text}
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button
            key={p.q}
            type="button"
            onClick={() => ask(p)}
            className="rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold text-foreground active:opacity-70"
          >
            {p.q}
          </button>
        ))}
      </div>
    </div>
  );
}

function RoamAvatar() {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
      <Image
        src="/logo.svg"
        alt="Roam"
        width={32}
        height={32}
        className="size-full object-cover"
        unoptimized
      />
    </span>
  );
}

/** 전시 홈 발화 풀 — 취향·개수로 조립, 여러 변주를 회전시킨다. */
function homeLines(
  home: { values: string[]; picked: number },
  t: TFn,
): string[] {
  if (home.picked <= 0) return [t("companion.homeEmpty")];
  if (home.values.length === 0)
    return [t("companion.homeEmpty"), t("companion.homeAsk")];
  const values = home.values.slice(0, 2).join("·");
  return [
    t("companion.homeValues", { values, n: home.picked }),
    t("companion.homePicked", { n: home.picked }),
    t("companion.homeAsk"),
  ];
}

/** 화면 맥락별 한 줄 발화. */
function contextLine(pathname: string, t: TFn): string {
  if (/\/exhibitions\/[^/]+\/community/.test(pathname))
    return t("companion.lineCommunity");
  if (/\/exhibitions\/[^/]+$/.test(pathname))
    return t("companion.lineExhibition");
  if (/\/booths\//.test(pathname)) return t("companion.lineBooth");
  return t("companion.lineDefault");
}
