"use client";

import { useState } from "react";
import { FolderOpen, Footprints, Loader2, MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { formatWalk } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { RoutePlan } from "@/lib/types";

/** Browse the caller's saved routes and load or delete one. */
export function MyRoutesSheet({
  onLoad,
}: {
  onLoad: (boothIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState<RoutePlan[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: RoutePlan[] }>("/api/me/routes");
      setRoutes(data);
    } catch {
      toast.error("동선을 불러오지 못했어요");
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) refresh();
  }

  function load(route: RoutePlan) {
    onLoad(route.boothIds);
    setOpen(false);
    toast.success(`‘${route.title}’ 동선을 불러왔어요`);
  }

  async function remove(id: string) {
    setDeletingId(id);
    try {
      await api.del(`/api/route/${id}`);
      setRoutes((rs) => rs.filter((r) => r.id !== id));
      toast.success("동선을 삭제했어요");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "삭제에 실패했어요";
      toast.error(msg);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onOpenChange(true)}
        aria-label="내 동선 목록"
      >
        <FolderOpen className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="px-5 pb-8">
          <SheetHeader>
            <SheetTitle>내 동선</SheetTitle>
            <SheetDescription>
              저장한 동선을 불러와 바로 이어서 쓸 수 있어요.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 max-h-[60dvh] space-y-2 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8 text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : routes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                저장한 동선이 없어요. 동선을 만들고 ‘저장’을 눌러보세요.
              </p>
            ) : (
              routes.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-card p-3"
                >
                  <button
                    type="button"
                    onClick={() => load(r)}
                    className="min-w-0 flex-1 text-left active:opacity-70"
                  >
                    <p className="truncate font-semibold">
                      {r.title ?? "이름 없는 동선"}
                    </p>
                    <p className="mt-0.5 flex items-center gap-2.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" /> {r.boothIds.length}곳
                      </span>
                      <span className="flex items-center gap-1">
                        <Footprints className="size-3.5" /> 이동{" "}
                        {formatWalk(r.estimatedMinutes)}
                      </span>
                    </p>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(r.id)}
                    disabled={deletingId === r.id}
                    aria-label="동선 삭제"
                  >
                    {deletingId === r.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Trash2 className="size-4 text-destructive" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
