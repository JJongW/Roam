"use client";

import { useState } from "react";
import { label, MEMO_MAX } from "@/lib/copy/v1";

/**
 * UI/입력 줄(Figma 3002:4486). 메모 한 줄(50자). 쓰는 중이면 테두리가 stroke-neutral-contrast 1.4로 진해지고
 * 오른쪽에 "17 / 50"이 붙는다. 엔터나 완료로 저장하고, 칸을 벗어나도 저장한다(6-07). 다 지우고 저장하면 지움(6-08).
 */
export function LineInput({
  initial,
  onSave,
  autoFocus,
  ariaLabel = label.memoField,
}: {
  initial: string;
  onSave: (text: string) => void;
  autoFocus?: boolean;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(initial);
  const [focused, setFocused] = useState(!!autoFocus);
  const commit = () => onSave(text);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        commit();
        (document.activeElement as HTMLElement | null)?.blur();
      }}
      style={{
        borderWidth: focused
          ? "var(--roam-v2-stroke-width-s1-4)"
          : "var(--roam-v2-stroke-width-s1)",
      }}
      className={
        "flex min-h-v2-x12 w-full items-center gap-v2-x2 rounded-v2-field bg-v2-bg-layer-floating px-v2-x4 py-v2-x3 " +
        (focused
          ? "border-v2-stroke-neutral-contrast"
          : "border-v2-stroke-neutral-muted")
      }
    >
      <input
        type="text"
        enterKeyHint="done"
        autoFocus={autoFocus}
        value={text}
        maxLength={MEMO_MAX}
        aria-label={ariaLabel}
        onChange={(e) => setText(e.target.value.slice(0, MEMO_MAX))}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        className="min-w-0 flex-1 bg-v2-bg-transparent text-v2-t5 font-v2-medium text-v2-fg-neutral caret-v2-fg-brand outline-none"
      />
      {focused && (
        <span className="shrink-0 text-v2-t3 font-v2-medium text-v2-fg-neutral-muted tabular-nums">
          {text.length} / {MEMO_MAX}
        </span>
      )}
    </form>
  );
}
