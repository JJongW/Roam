"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { eventInputSchema } from "@/lib/schemas";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/states";
import type { Booth, BoothEvent } from "@/lib/types";

interface Draft {
  boothId?: string;
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  rewardInfo?: string;
}

export function EventManager({ events, booths }: { events: BoothEvent[]; booths: Booth[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [busy, setBusy] = useState(false);
  const boothName = (id: string) => booths.find((b) => b.id === id)?.name ?? id;

  function startCreate() {
    setDraft({ boothId: booths[0]?.id });
    setOpen(true);
  }

  async function submit() {
    const payload = {
      boothId: draft.boothId ?? booths[0]?.id ?? "",
      title: draft.title ?? "",
      description: draft.description ?? "",
      startTime: draft.startTime ? new Date(draft.startTime).toISOString() : "",
      endTime: draft.endTime ? new Date(draft.endTime).toISOString() : "",
      rewardInfo: draft.rewardInfo || undefined,
    };
    const parsed = eventInputSchema.safeParse(payload);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/events", parsed.data);
      toast.success("이벤트를 추가했어요");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장 실패");
    } finally {
      setBusy(false);
    }
  }

  async function remove(ev: BoothEvent) {
    if (!confirm(`'${ev.title}' 이벤트를 삭제할까요?`)) return;
    try {
      await api.del(`/api/events/${ev.id}`);
      toast.success("삭제했어요");
      router.refresh();
    } catch {
      toast.error("삭제 실패");
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{events.length}개 이벤트</p>
        <Button size="sm" onClick={startCreate}>
          <Plus className="size-4" /> 새 이벤트
        </Button>
      </div>

      {events.length === 0 ? (
        <EmptyState icon={CalendarClock} title="이벤트가 없어요" description="첫 이벤트를 등록해 보세요." />
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <Card key={ev.id} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{ev.title}</p>
                <p className="truncate text-sm text-muted-foreground">{boothName(ev.boothId)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {format(new Date(ev.startTime), "M.d HH:mm")} – {format(new Date(ev.endTime), "HH:mm")}
                </p>
              </div>
              <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => remove(ev)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>새 이벤트</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-5 py-3">
            <Field label="부스">
              <Select value={draft.boothId} onValueChange={(v) => setDraft({ ...draft, boothId: v })}>
                <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                <SelectContent>
                  {booths.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="제목">
              <Input value={draft.title ?? ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </Field>
            <Field label="설명">
              <Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작">
                <Input type="datetime-local" value={draft.startTime ?? ""} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} />
              </Field>
              <Field label="종료">
                <Input type="datetime-local" value={draft.endTime ?? ""} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} />
              </Field>
            </div>
            <Field label="보상 정보 (선택)">
              <Input value={draft.rewardInfo ?? ""} onChange={(e) => setDraft({ ...draft, rewardInfo: e.target.value })} />
            </Field>
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
