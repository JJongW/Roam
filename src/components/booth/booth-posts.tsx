"use client";

import { useEffect, useRef, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CommunityPost } from "@/lib/types";

/**
 * Crowd-sourced info thread on a booth's detail page (feature: 사용자 기여 정보).
 * Posting is allowed without login; the nickname defaults to the signed-in name.
 */
export function BoothPosts({ boothId }: { boothId: string }) {
  const user = useAuthStore((s) => s.user);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const seededName = useRef(false);

  useEffect(() => {
    api
      .get<{ data: CommunityPost[] }>(`/api/booths/${boothId}/posts`)
      .then(({ data }) => setPosts(data))
      .catch(() => {});
  }, [boothId]);

  // Prefer the signed-in nickname; otherwise restore the last-used name.
  useEffect(() => {
    if (user) {
      setName(user.nickname);
      return;
    }
    if (seededName.current) return;
    seededName.current = true;
    setName(localStorage.getItem("roam-author-name") ?? "");
  }, [user]);

  async function submit() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const authorName = name.trim() || "익명";
    if (!user && name.trim()) localStorage.setItem("roam-author-name", name.trim());
    try {
      const { post } = await api.post<{ post: CommunityPost }>(
        `/api/booths/${boothId}/posts`,
        { body: text, authorName },
      );
      setPosts((prev) => [post, ...prev]);
      setBody("");
    } catch (e) {
      const msg = e instanceof ApiClientError ? e.error.message : "전송에 실패했어요";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">방문자 정보</h2>
        <span className="text-xs text-muted-foreground">{posts.length}개</span>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
        {!user && (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="닉네임 (선택)"
            maxLength={30}
            className="h-9"
            aria-label="닉네임"
          />
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="이 부스 정보를 공유해 주세요 (굿즈·대기·꿀팁 등)"
            rows={2}
            maxLength={500}
            className="flex-1 resize-none"
            aria-label="부스 정보 작성"
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
            }}
          />
          <Button
            size="icon"
            className="size-11 shrink-0"
            onClick={submit}
            disabled={busy || !body.trim()}
            aria-label="전송"
          >
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </Button>
        </div>
      </div>

      {posts.length > 0 && (
        <ul className="space-y-2">
          {posts.map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-border bg-card p-3.5"
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
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
