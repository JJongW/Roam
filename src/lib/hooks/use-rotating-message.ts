"use client";

import { useEffect, useState } from "react";

/**
 * Cycle through a list of messages while a long wait is in progress, so the copy
 * feels alive instead of a single frozen line. Starts at the first message and
 * advances every `intervalMs`. Pass `active=false` to pause + reset.
 */
export function useRotatingMessage(
  messages: readonly string[],
  active = true,
  intervalMs = 2200,
): string {
  const [i, setI] = useState(0);

  useEffect(() => {
    if (!active || messages.length <= 1) return;
    setI(0);
    const id = setInterval(
      () => setI((n) => (n + 1) % messages.length),
      intervalMs,
    );
    return () => clearInterval(id);
  }, [active, intervalMs, messages.length]);

  return messages[i] ?? messages[0] ?? "";
}
