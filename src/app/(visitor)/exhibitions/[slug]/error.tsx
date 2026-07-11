"use client";

import { ErrorState } from "@/components/common/error-state";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorState reset={reset} />;
}
