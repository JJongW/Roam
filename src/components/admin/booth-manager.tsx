"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { boothInputSchema } from "@/lib/schemas";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryChip } from "@/components/booth/category-chip";
import { EmptyState } from "@/components/common/states";
import type { Booth, Category, Hall } from "@/lib/types";

interface Props {
  exhibitionId: string;
  booths: Booth[];
  categories: Category[];
  halls: Hall[];
}

type Draft = Partial<Booth>;

export function BoothManager({ exhibitionId, booths, categories, halls }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Booth | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const catById = new Map(categories.map((c) => [c.id, c]));

  function startCreate() {
    setEditing(null);
    setDraft({
      hallId: halls[0]?.id,
      categoryId: categories[0]?.id,
      x: 500,
      y: 350,
      popularity: 50,
    });
    setOpen(true);
  }
  function startEdit(b: Booth) {
    setEditing(b);
    setDraft({ ...b });
    setOpen(true);
  }

  async function submit() {
    const category = categories.find((c) => c.id === draft.categoryId);
    const payload = {
      exhibitionId,
      hallId: draft.hallId ?? halls[0]?.id ?? "",
      categoryId: draft.categoryId ?? categories[0]?.id ?? "",
      name: draft.name ?? "",
      company: draft.company ?? "",
      description: draft.description ?? "",
      longDescription: draft.longDescription ?? draft.description ?? "",
      images: [],
      tags: category ? [category.slug] : [],
      x: Number(draft.x ?? 500),
      y: Number(draft.y ?? 350),
      popularity: Number(draft.popularity ?? 50),
    };
    const parsed = boothInputSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요");
      return;
    }
    setBusy(true);
    try {
      if (editing) await api.patch(`/api/booths/${editing.id}`, parsed.data);
      else await api.post("/api/booths", parsed.data);
      toast.success(editing ? "부스를 수정했어요" : "부스를 추가했어요");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove(b: Booth) {
    if (!confirm(`'${b.name}' 부스를 삭제할까요?`)) return;
    try {
      await api.del(`/api/booths/${b.id}`);
      toast.success("삭제했어요");
      router.refresh();
    } catch {
      toast.error("삭제 실패");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{booths.length}개 부스</p>
        <Button size="sm" onClick={startCreate}>
          <Plus className="size-4" /> 새 부스
        </Button>
      </div>

      {booths.length === 0 ? (
        <EmptyState title="부스가 없어요" description="첫 부스를 추가해 보세요." />
      ) : (
        <div className="space-y-2">
          {booths.map((b) => (
            <Card key={b.id} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{b.name}</p>
                <p className="truncate text-sm text-muted-foreground">{b.company}</p>
                <div className="mt-1">{catById.get(b.categoryId) && <CategoryChip category={catById.get(b.categoryId)!} />}</div>
              </div>
              <Button variant="ghost" size="icon" aria-label="수정" onClick={() => startEdit(b)}>
                <Pencil className="size-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => remove(b)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{editing ? "부스 수정" : "새 부스"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-5 py-3">
            <Field label="부스명">
              <Input value={draft.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="회사">
              <Input value={draft.company ?? ""} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="카테고리">
                <Select value={draft.categoryId} onValueChange={(v) => setDraft({ ...draft, categoryId: v })}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="홀">
                <Select value={draft.hallId} onValueChange={(v) => setDraft({ ...draft, hallId: v })}>
                  <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    {halls.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="설명">
              <Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="X 좌표">
                <Input type="number" value={draft.x ?? 0} onChange={(e) => setDraft({ ...draft, x: Number(e.target.value) })} />
              </Field>
              <Field label="Y 좌표">
                <Input type="number" value={draft.y ?? 0} onChange={(e) => setDraft({ ...draft, y: Number(e.target.value) })} />
              </Field>
              <Field label="인기도">
                <Input type="number" value={draft.popularity ?? 50} onChange={(e) => setDraft({ ...draft, popularity: Number(e.target.value) })} />
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
