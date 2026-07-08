import { RoamMotion } from "@/components/companion/roam-motion";

/**
 * Roam 타이핑/전환 인디케이터 — head.mp4 모션 + 점 애니메이션. 대화 흐름에서 다음
 * 발화 전, 또는 화면 전환·로딩 대기 구간에 잠깐 띄운다(사용자 발화 요청).
 */
export function RoamTyping({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground">
      <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
        <RoamMotion src="/head.mp4" />
      </span>
      <span className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2.5">
        <Dot delay="0ms" />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
        {label && <span className="ml-1 text-xs">{label}</span>}
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60"
      style={{ animationDelay: delay }}
    />
  );
}
