"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { AdminSection } from "@/components/admin/section";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { TimelineRow } from "@/components/admin/timeline-row";
import { TasteRadar } from "@/components/me/taste-radar";
import { useT } from "@/lib/i18n/provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buildTimeline, groupEventsByDay, type TimelineEvent } from "@/lib/admin/timeline";
import type { Bookmark, User, UserSignal } from "@/lib/types";

export default function AdminAccountDrilldownPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{
          user: User;
          signals: UserSignal[];
          bookmarks: Bookmark[];
          values: Record<string, number>;
        }>(`/api/admin/users/${id}`);
        setUser(data.user);
        setBookmarks(data.bookmarks);
        setValues(data.values);
        const nicknames = new Map([[data.user.id, data.user.nickname]]);
        setEvents(buildTimeline(data.signals, [], nicknames, new Map(), new Map()));
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  async function removeBookmark(b: Bookmark) {
    try {
      await api.del(`/api/admin/users/${id}/bookmarks`, {
        targetType: b.targetType,
        targetId: b.targetId,
      });
      toast.success("삭제했어요");
      setBookmarks((prev) => prev.filter((x) => x.id !== b.id));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "삭제 실패");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;

  if (notFound || !user) {
    return (
      <EmptyState
        title="계정을 찾을 수 없어요"
        action={
          <Link href="/admin/accounts" className="text-sm text-primary hover:underline">
            계정 목록으로
          </Link>
        }
      />
    );
  }

  const dayGroups = groupEventsByDay(events);

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/accounts"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 계정 목록
        </Link>
        <h1 className="text-2xl font-extrabold">{user.nickname}</h1>
      </header>

      <AdminSection title="취향" description="8가치 축 확신도">
        <TasteRadar values={values} label={(s) => t(`values.${s}`)} />
      </AdminSection>

      <AdminSection title="반응 타임라인" description={`${events.length}건`}>
        {events.length === 0 ? (
          <EmptyState title="반응 기록이 없어요" />
        ) : (
          dayGroups.map((group) => (
            <div key={group.dateLabel} className="mt-3 first:mt-0">
              <p className="mb-1 text-xs font-bold text-muted-foreground">
                {group.dateLabel}
              </p>
              {group.events.map((e) => (
                <TimelineRow key={e.id} event={e} />
              ))}
            </div>
          ))
        )}
      </AdminSection>

      <AdminSection title="북마크" description={`${bookmarks.length}개`}>
        {bookmarks.length === 0 ? (
          <EmptyState title="북마크가 없어요" />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {bookmarks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {b.targetType} · {b.targetId}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="북마크 삭제">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>북마크 삭제</AlertDialogTitle>
                      <AlertDialogDescription>
                        이 북마크를 삭제할까요?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => removeBookmark(b)}
                      >
                        삭제
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
