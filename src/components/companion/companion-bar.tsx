"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/stores/auth";
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
  const pathname = usePathname() ?? "";
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  const line = useMemo(() => contextLine(pathname), [pathname]);

  // 로그인 사용자 + 방문객 화면에서만. 지도는 자체 전체화면 UI라 겹침 피해 숨김.
  if (!user) return null;
  if (pathname.endsWith("/map") || pathname.startsWith("/login")) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-md justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-background/90 py-2 pl-2 pr-4 shadow-[var(--shadow-card)] backdrop-blur-xl active:scale-[0.98]"
        >
          <RoamAvatar />
          <span className="truncate text-sm font-semibold">{line}</span>
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-5 pb-8">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <RoamAvatar />
              Roam한테 물어보기
            </SheetTitle>
          </SheetHeader>
          <CompanionChat />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** 탭 대화 — 정해진 질문에 로컬 템플릿으로 즉답. LLM 없음(속도 규칙). */
function CompanionChat() {
  const [log, setLog] = useState<{ role: "you" | "roam"; text: string }[]>([]);

  function ask(q: (typeof PROMPTS)[number]) {
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
        {PROMPTS.map((p) => (
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

/** 화면 맥락별 한 줄 발화. */
function contextLine(pathname: string): string {
  if (pathname === "/") return "어디부터 볼지 같이 정할까?";
  if (/\/exhibitions\/[^/]+\/community/.test(pathname))
    return "다른 사람은 뭘 봤나 궁금해?";
  if (/\/exhibitions\/[^/]+$/.test(pathname)) return "골라둔 곳 마음에 들어?";
  if (/\/booths\//.test(pathname)) return "여기 어때? 끌리면 반응 남겨줘.";
  return "궁금한 거 있으면 물어봐.";
}

/** 탭 대화 로컬 템플릿(질문→즉답). 근거·판단 기준을 주되 결정은 사용자. */
const PROMPTS = [
  {
    q: "지금 뭐 보면 좋아?",
    a: "네가 고른 가치로 미리 골라뒀어. 피드 맨 위부터 봐 — 확실히 취향인 것부터 있고, 아래로 갈수록 좀 새로운 결이야.",
  },
  {
    q: "사람 많은 데 피하고 싶어",
    a: "부스마다 붐빔 정도를 큐로 붙여놨어. '한산'·'적당히' 위주로 돌면 여유로워. 붐비는 곳은 이른 시간대나 늦은 시간대에.",
  },
  {
    q: "왜 이걸 추천했어?",
    a: "네 관심 가치랑 겹치는 부스라 골랐어. 카드의 색 태그가 그 연결 고리 — 그걸 보고 끌리는지 네가 판단하면 돼.",
  },
] as const;
