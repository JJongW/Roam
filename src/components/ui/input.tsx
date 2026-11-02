"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { fieldInvalidClass, useFieldProps } from "@/components/ui/field";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const field = useFieldProps(props);
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-11 w-full rounded-lg border border-input bg-background px-3.5 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          fieldInvalidClass,
          className,
        )}
        {...field}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
