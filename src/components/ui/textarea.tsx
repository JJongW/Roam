"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldInvalidClass, useFieldProps } from "@/components/ui/field";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  const field = useFieldProps(props);
  return (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[88px] w-full rounded-lg border border-input bg-background px-3.5 py-2.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
        fieldInvalidClass,
        className,
      )}
      {...field}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
