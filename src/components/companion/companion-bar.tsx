"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";
import type { TFn } from "@/lib/i18n/resolve";
import { RoamAvatar } from "@/components/companion/roam-avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Chip } from "@/components/ui/chip";
import { ProgressCircle } from "@/components/ui/progress-circle";
import { trackUiClick, type UiControl } from "@/lib/analytics/ui-controls";

/**
 * 상주 컴패니언 바 — 방문객 전 화면에 뜨는 Roam 플로팅 필(로고 + 취향 파악도 링).
 * 탭하면 대화 시트가 열린다. companion-reframe Phase G. 탭 대화엔 LLM 금지
 * (속도 규칙) — 즉답 로컬 템플릿만. 로그인 전(로그인/온보딩 게이트)엔 뜨지 않는다.
 *
 * ⚠️ 발화는 여기서 안 한다 — 상단 토스트로 뺐다. 예전엔 이 필 안에 맥락 발화가
 * 상시로 회전했는데, 같은 줄에 취향 링까지 있어 둘이 겹쳐 읽혔다("정신사납다").
 * 지금은 필 = 취향 링(상태, 상시) / 토스트 = 발화(사건, 반응할 때만)로 나뉜다.
 */
export function CompanionBar() {
  const t = useT();
  const pathname = usePathname() ?? "";
  const user = useAuthStore((s) => s.user);
  const home = useCompanionStore((s) => s.home);
  const flash = useCompanionStore((s) => s.flash);
  const clearFlash = useCompanionStore((s) => s.clearFlash);
  const tasteJudged = useCompanionStore((s) => s.tasteJudged);
  const tastePct = useCompanionStore((s) => s.tastePct);
  const [open, setOpen] = useState(false);

  // 발화(flash)는 상단 토스트로만 낸다 — 반응했을 때만 잠깐 떴다 스스로 사라진다.
  // sonner는 이미 top-center로 깔려 있고(providers.tsx) 토스트마다 role="status"
  // + aria-live를 붙여주며, 모션은 globals.css의 prefers-reduced-motion 전역
  // 규칙이 죽인다 — 그래서 직접 만들지 않는다.
  // ⚠️ 이 훅은 아래 early return보다 위에 있어야 한다(훅 규칙이기도 하지만,
  // 필이 숨는 화면 = 지도·비로그인에서도 발화는 나와야 하기 때문). 지도가
  // 따로 들고 있던 같은 구독은 이걸로 대체돼 지웠다(map-view.tsx).
  useEffect(() => {
    if (!flash) return;
    toast(flash, {
      // 3.5초 — 한 줄 읽고 사라지는 길이. 남아 있어 봐야 다음 반응을 가린다.
      duration: 3500,
      icon: <RoamAvatar className="size-5" />,
    });
    clearFlash();
  }, [flash, clearFlash]);

  // 취향 파악도 링은 전시 홈에서만 — 다른 화면에선 필이 아바타 하나로 줄어든다.
  const isExhibitionHome = /\/exhibitions\/[^/]+$/.test(pathname);

  const exhibitionSlugFromPath = pathname.match(/\/exhibitions\/([^/]+)/)?.[1];
  const activeExhibitionId = useCompanionStore((s) => s.activeExhibitionId);

  const trackClick = (control: UiControl) =>
    trackUiClick(
      {
        exhibitionSlug: exhibitionSlugFromPath,
        exhibitionId: activeExhibitionId,
      },
      control,
    );

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
          onClick={() => {
            trackClick("companion_bar_open");
            setOpen(true);
          }}
          // 발화 텍스트가 빠져 접근 가능한 이름이 없어졌다 — 로미 아바타는
          // aria-hidden 이미지라 라벨을 대신 못 준다.
          aria-label={t("companion.ask")}
          className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-background/90 p-2 shadow-[var(--shadow-card)] backdrop-blur-xl active:scale-[0.98]"
        >
          <RoamAvatar />
          {isExhibitionHome && home && tastePct !== null && (
            <Chip
              icon={<ProgressCircle size={24} value={tastePct} tone="brand" />}
              className="pl-0.5"
            >
              {/* 판정 수를 같이 보여준다 — 8~15개짜리 표본에서 %가 크게 출렁이는 걸
                  숫자만 보면 "이유 없이" 흔들리는 걸로 느낀다. 옆에 몇 건 기준인지
                  붙여두면 적어도 "표본이 작아서"라는 힌트는 상시 보인다. */}
              {t("companion.tastePct", { pct: tastePct, n: tasteJudged })}
            </Chip>
          )}
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
          <CompanionChat t={t} onAsk={trackClick} />
        </SheetContent>
      </Sheet>
    </>
  );
}

/** 탭 대화 — 정해진 질문에 로컬 템플릿으로 즉답. LLM 없음(속도 규칙). */
function CompanionChat({
  t,
  onAsk,
}: {
  t: TFn;
  onAsk: (control: UiControl) => void;
}) {
  const [log, setLog] = useState<{ role: "you" | "roam"; text: string }[]>([]);
  const prompts = [
    { q: t("companion.q1"), a: t("companion.a1"), control: "companion_faq_q1" },
    { q: t("companion.q2"), a: t("companion.a2"), control: "companion_faq_q2" },
    { q: t("companion.q3"), a: t("companion.a3"), control: "companion_faq_q3" },
  ] satisfies { q: string; a: string; control: UiControl }[];

  function ask(q: { q: string; a: string; control: UiControl }) {
    onAsk(q.control);
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

