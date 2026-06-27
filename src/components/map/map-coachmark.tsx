"use client";

import {
  Maximize2,
  Plus,
  RotateCw,
  Sparkles,
  NotebookPen,
  MessagesSquare,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * First-visit map guide. Shown once after onboarding when the visitor first
 * lands on the map, explaining what each control + the booth colours mean.
 * Dismissing it flips the persisted `mapGuideSeen` flag so it never reappears.
 */
const ITEMS: { Icon: typeof Plus; label: string; desc: string }[] = [
  { Icon: Maximize2, label: "전체 보기", desc: "지도를 한눈에 보이게 맞춰요." },
  { Icon: Plus, label: "확대·축소", desc: "+/− 또는 손가락으로 줌인·줌아웃." },
  { Icon: RotateCw, label: "회전", desc: "지도를 90°씩 돌려서 방향을 맞춰요." },
  { Icon: Sparkles, label: "AI 추천", desc: "지금 관심사로 동선을 새로 받아요." },
  { Icon: NotebookPen, label: "메모장", desc: "방문·관심·메모를 모아봐요." },
  { Icon: MessagesSquare, label: "커뮤니티", desc: "현장 소식을 실시간으로 나눠요." },
  {
    Icon: Palette,
    label: "부스 색",
    desc: "초록=방문, 노랑=관심, 보라=내 동선.",
  },
];

export function MapCoachmark({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-4">
        <h2 className="text-lg font-extrabold">지도 사용법 한눈에</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          버튼과 색이 무슨 뜻인지 먼저 알려드릴게요.
        </p>
        <ul className="mt-4 space-y-3">
          {ITEMS.map(({ Icon, label, desc }) => (
            <li key={label} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Icon className="size-4.5 text-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">{label}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <Button className="mt-5 w-full" size="lg" onClick={onClose}>
          알겠어요, 시작할게요
        </Button>
      </div>
    </div>
  );
}
