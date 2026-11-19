"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Exhibition } from "@/lib/types";
import { selectAdminExhibition } from "./select-exhibition";

/** 박람회 선택기. 박람회 하나를 보는 화면의 머리 줄(AdminFairHeader)에서만 그린다. */
export function ExhibitionSwitcher({
  exhibitions,
  selectedId,
}: {
  exhibitions: Exhibition[];
  selectedId: string | undefined;
}) {
  const [pending, setPending] = useState(false);
  if (exhibitions.length === 0) return null;

  const sorted = [...exhibitions].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );

  async function onChange(exhibitionId: string) {
    setPending(true);
    try {
      await selectAdminExhibition(exhibitionId);
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "행사를 바꾸지 못했어요");
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={selectedId} onValueChange={onChange} disabled={pending}>
      <SelectTrigger aria-label="볼 행사 고르기" className="w-full sm:w-64">
        <SelectValue placeholder="행사 선택" />
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
