"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Exhibition } from "@/lib/types";

export function ExhibitionSwitcher({
  exhibitions,
  selectedId,
}: {
  exhibitions: Exhibition[];
  selectedId: string | undefined;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (exhibitions.length === 0) return null;

  const sorted = [...exhibitions].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );

  async function onChange(exhibitionId: string) {
    setPending(true);
    try {
      await api.post("/api/admin/exhibition-selection", { exhibitionId });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={selectedId} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-full max-w-xs">
        <SelectValue placeholder="전시 선택" />
      </SelectTrigger>
      <SelectContent>
        {sorted.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
