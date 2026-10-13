"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2, MapPin } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { exhibitionInputSchema } from "@/lib/schemas";
import { shakeElement } from "@/lib/dom/shake";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import {
  fieldErrorsOf,
  zodFieldErrors,
  type FieldErrors,
} from "@/lib/api/field-errors";
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
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const sheetRef = useRef<HTMLDivElement>(null);

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
    // 재진입 가드 — disabled는 리렌더 뒤에야 걸린다. 빠른 두 번 탭이 같은 요청을
    // 두 번 보내면 서버에서 409가 나거나(중복) 같은 글이 두 번 올라간다.
    if (busy) return;
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
      // 어느 칸이 틀렸는지 칸마다 붙인다 — 예전엔 첫 오류 하나만 토스트로 떠서
      // 두 칸이 틀렸으면 두 번 저장을 눌러야 알 수 있었다.
      setFieldErrors(zodFieldErrors(parsed.error));
      shakeElement(sheetRef.current);
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      if (editing)
        await api.patch(`/api/exhibitions/${editing.id}`, parsed.data);
      else await api.post("/api/exhibitions", parsed.data);
      toast.success(editing ? "전시를 수정했어요" : "전시를 추가했어요");
      setOpen(false);
      router.refresh();
    } catch (e) {
      const fromServer = fieldErrorsOf(e);
      if (Object.keys(fromServer).length) setFieldErrors(fromServer);
      else
        toast.error(e instanceof ApiClientError ? e.error.message : "저장 실패");
      shakeElement(sheetRef.current);
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
        <SheetContent
          ref={sheetRef}
          side="bottom"
          className="max-h-[90dvh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>{editing ? "전시 수정" : "새 전시"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-3 px-5 py-3">
            <Field label="이름" error={fieldErrors.name}>
              <Input
                value={draft.name ?? ""}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="장소" error={fieldErrors.venue}>
              <Input
                value={draft.venue ?? ""}
                onChange={(e) => setDraft({ ...draft, venue: e.target.value })}
              />
            </Field>
            <Field label="설명" error={fieldErrors.description}>
              <Textarea
                value={draft.description ?? ""}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="시작일" error={fieldErrors.startDate}>
                <Input
                  type="date"
                  value={draft.startDate ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, startDate: e.target.value })
                  }
                />
              </Field>
              <Field label="종료일" error={fieldErrors.endDate}>
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
