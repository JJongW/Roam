"use client";

import {
  Maximize2,
  Plus,
  RotateCw,
  NotebookPen,
  MessagesSquare,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * First-visit map guide. Shown once after onboarding when the visitor first
 * lands on the map, explaining what each control + the booth colours mean.
 * Dismissing it flips the persisted `mapGuideSeen` flag so it never reappears.
 * 지도는 길찾기가 아니라 "관심 밀도 지도"(동선 제거) — 안내도 그에 맞춘다.
 */
const ITEMS: { Icon: typeof Plus; label: string; desc: string }[] = [
  { Icon: Maximize2, label: "전체 보기", desc: "지도를 한눈에 맞춰줘." },
  { Icon: Plus, label: "확대·축소", desc: "+/− 또는 손가락으로 줌인·줌아웃." },
  { Icon: RotateCw, label: "회전", desc: "지도를 90°씩 돌려 방향을 맞춰." },
  { Icon: NotebookPen, label: "메모장", desc: "가본 곳·관심·메모를 모아봐." },
  {
    Icon: MessagesSquare,
    label: "커뮤니티",
    desc: "현장 소식을 실시간으로 나눠.",
  },
  {
    Icon: Palette,
    label: "부스 색",
    desc: "초록=가봄, 노랑=끌린 곳. 반응할수록 관심이 진해져.",
  },
];

export function MapCoachmark({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-4">
        <h2 className="text-lg font-extrabold">지도 사용법, 짚어줄게</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          길찾기가 아니라 네 관심이 쌓이는 지도야. 버튼이랑 색만 알면 돼.
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
          알겠어, 시작할게
        </Button>
      </div>
    </div>
  );
}
