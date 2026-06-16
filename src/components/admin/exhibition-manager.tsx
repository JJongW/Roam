"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { exhibitionInputSchema } from "@/lib/schemas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import type { Exhibition } from "@/lib/types";

type Draft = Partial<Exhibition>;

export function ExhibitionManager({
  exhibitions,
}: {
  exhibitions: Exhibition[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Exhibition | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);

  function startCreate() {
    setEditing(null);
    setDraft({ mapWidth: 1000, mapHeight: 700, startDate: "", endDate: "" });
    setOpen(true);
  }
  function startEdit(ex: Exhibition) {
    setEditing(ex);
    setDraft({ ...ex });
    setOpen(true);
  }

  async function submit() {
    const payload = {
      slug:
        draft.slug ??
        ((draft.name ?? "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") ||
          "exhibition"),
      name: draft.name ?? "",
      venue: draft.venue ?? "",
      description: draft.description ?? "",
      startDate: draft.startDate ?? "",
      endDate: draft.endDate ?? "",
      mapWidth: Number(draft.mapWidth ?? 1000),
      mapHeight: Number(draft.mapHeight ?? 700),
      tips: draft.tips ?? {},
    };
    const parsed = exhibitionInputSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요");
      return;
    }
    setBusy(true);
    try {
      if (editing)
        await api.patch(`/api/exhibitions/${editing.id}`, parsed.data);
      else await api.post("/api/exhibitions", parsed.data);
      toast.success(editing ? "전시를 수정했어요" : "전시를 추가했어요");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {exhibitions.length}개 전시
        </p>
        <Button size="sm" onClick={startCreate}>
          <Plus className="size-4" /> 새 전시
        </Button>
      </div>

      <div className="space-y-2">
        {exhibitions.map((ex) => (
          <Card key={ex.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{ex.name}</p>
              <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                <MapPin className="size-3.5" /> {ex.venue}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {ex.startDate && format(new Date(ex.startDate), "yyyy.M.d")} –{" "}
                {ex.endDate && format(new Date(ex.endDate), "M.d")}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="수정"
              onClick={() => startEdit(ex)}
            >
              <Pencil className="size-4" />
            </Button>
          </Card>
        ))}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "전시 수정" : "새 전시"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-5 py-3">
            <Field label="이름">
              <Input
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="장소">
              <Input
                value={draft.venue ?? ""}
                onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
              />
            </Field>
            <Field label="설명">
              <Textarea
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작일">
                <Input
                  type="date"
                  value={draft.startDate ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, startDate: e.target.value })
                  }
                />
              </Field>
              <Field label="종료일">
                <Input
                  type="date"
                  value={draft.endDate ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, endDate: e.target.value })
                  }
                />
              </Field>
            </div>
          </div>
          <SheetFooter>
            <Button onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} 저장
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
