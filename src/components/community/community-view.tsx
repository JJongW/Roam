"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { MapPin, MessagesSquare, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { watchPosts } from "@/lib/realtime";
import { AppBar } from "@/components/common/app-bar";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Booth, CommunityPost } from "@/lib/types";

const NAME_KEY = "roam-author-name";

export function CommunityView({
  slug,
  booths,
  initialPosts,
}: {
  slug: string;
  booths: Booth[];
  initialPosts: CommunityPost[];
}) {
  const [posts, setPosts] = useState<CommunityPost[]>(initialPosts);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [boothId, setBoothId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const boothById = useMemo(
    () => new Map(booths.map((b) => [b.id, b])),
    [booths],
  );
  const seededName = useRef(false);

  // Restore the visitor's preferred display name.
  useEffect(() => {
    if (seededName.current) return;
    seededName.current = true;
    setName(localStorage.getItem(NAME_KEY) ?? "");
  }, []);

  // Live feed: realtime in Supabase mode, polling in mock mode.
  useEffect(() => {
    const off = watchPosts(slug, setPosts);
    return off;
  }, [slug]);

  async function submit() {
    const text = body.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    const authorName = name.trim() || "익명";
    if (name.trim()) localStorage.setItem(NAME_KEY, name.trim());
    try {
      const { post } = await api.post<{ post: CommunityPost }>(
        `/api/exhibitions/${slug}/community`,
        { body: text, authorName, boothId: boothId || undefined },
      );
      // Optimistically prepend; the live feed will reconcile.
      setPosts((prev) => [post, ...prev.filter((p) => p.id !== post.id)]);
      setBody("");
      setBoothId("");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "전송에 실패했어요";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppBar title="실시간 커뮤니티" />

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {posts.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={MessagesSquare}
              title="아직 글이 없어요"
              description="현장 소식을 가장 먼저 공유해 보세요!"
            />
          </div>
        ) : (
          <ul className="space-y-2.5">
            {posts.map((p) => {
              const booth = p.boothId ? boothById.get(p.boothId) : undefined;
              return (
                <li
                  key={p.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold">{p.authorName}</span>
                    <time className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(p.createdAt), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </time>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">
                    {p.body}
                  </p>
                  {booth && (
                    <Link
                      href={`/booths/${booth.id}`}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground"
                    >
                      <MapPin className="size-3.5 text-primary" />
                      {booth.name}
                      {booth.code ? ` · ${booth.code}` : ""}
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-border bg-background p-3 pb-safe">
        <div className="mb-2 flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="닉네임 (선택)"
            maxLength={30}
            className="h-9 flex-1"
            aria-label="닉네임"
          />
          <select
            value={boothId}
            onChange={(e) => setBoothId(e.target.value)}
            aria-label="관련 부스 (선택)"
            className="h-9 flex-1 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="">부스 태그 (선택)</option>
            {booths.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.code ? ` (${b.code})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="현장 소식을 공유해 보세요 (대기시간, 굿즈 정보 등)"
            rows={2}
            maxLength={500}
            className="flex-1 resize-none"
            aria-label="내용"
            onKeyDown={(e) => {
              // Ignore Enter fired while composing Hangul (IME).
              if (e.nativeEvent.isComposing) return;
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />
          <Button
            size="icon"
            className="size-11 shrink-0"
            onClick={submit}
            disabled={submitting || !body.trim()}
            aria-label="전송"
          >
            {submitting ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
