"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import type { Booth, Waiting } from "@/lib/types";

interface Row {
  booth: Booth;
  enabled: boolean;
  queueCount: number;
  estimatedMinutes: number;
}

export function WaitingManager({ booths, waitings }: { booths: Booth[]; waitings: Record<string, Waiting> }) {
  const [rows, setRows] = useState<Row[]>(
    booths.map((b) => ({
      booth: b,
      enabled: waitings[b.id]?.enabled ?? false,
      queueCount: waitings[b.id]?.queueCount ?? 0,
      estimatedMinutes: waitings[b.id]?.estimatedMinutes ?? 0,
    })),
  );
  const [savingId, setSavingId] = useState<string | null>(null);

  function patch(id: string, p: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.booth.id === id ? { ...r, ...p } : r)));
  }

  async function save(row: Row) {
    setSavingId(row.booth.id);
    try {
      await api.put(`/api/booths/${row.booth.id}/waiting`, {
        enabled: row.enabled,
        queueCount: Number(row.queueCount),
        estimatedMinutes: Number(row.estimatedMinutes),
      });
      toast.success(`${row.booth.name} 대기 정보 저장됨`);
    } catch {
      toast.error("저장에 실패했어요");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.booth.id} className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-bold">{row.booth.name}</p>
              <p className="truncate text-sm text-muted-foreground">{row.booth.company}</p>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              대기 운영
              <Switch checked={row.enabled} onCheckedChange={(v) => patch(row.booth.id, { enabled: v })} />
            </label>
          </div>

          {row.enabled && (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label htmlFor={`q-${row.booth.id}`} className="text-xs">대기 팀 수</Label>
                <Input
                  id={`q-${row.booth.id}`}
                  type="number"
                  inputMode="numeric"
                  className="h-10 w-28"
                  value={row.queueCount}
                  onChange={(e) => patch(row.booth.id, { queueCount: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`m-${row.booth.id}`} className="text-xs">예상 대기(분)</Label>
                <Input
                  id={`m-${row.booth.id}`}
                  type="number"
                  inputMode="numeric"
                  className="h-10 w-28"
                  value={row.estimatedMinutes}
                  onChange={(e) => patch(row.booth.id, { estimatedMinutes: Number(e.target.value) })}
                />
              </div>
              <Button size="sm" onClick={() => save(row)} disabled={savingId === row.booth.id}>
                {savingId === row.booth.id ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                저장
              </Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
