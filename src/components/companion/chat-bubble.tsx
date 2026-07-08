import Image from "next/image";

/** Roam 대화 말풍선 — Roam(좌·로고 아바타)/사용자(우·primary). 온보딩 대화에서 공용. */
export function ChatBubble({
  from,
  text,
}: {
  from: "roam" | "you";
  text: string;
}) {
  if (from === "you") {
    return (
      <div className="animate-in fade-in slide-in-from-bottom-1 flex justify-end duration-300">
        <span className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground">
          {text}
        </span>
      </div>
    );
  }
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 flex items-end gap-2 duration-300">
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
      <span className="max-w-[85%] rounded-2xl rounded-bl-sm bg-secondary px-3.5 py-2 text-sm leading-relaxed">
        {text}
      </span>
    </div>
  );
}
