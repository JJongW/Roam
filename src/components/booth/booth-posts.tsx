"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatPostTime } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/api/client";
import { addMyPostId, getMyPostIds, removeMyPostId } from "@/lib/my-posts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useT } from "@/lib/i18n/provider";
import { useAuthStore } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState, LoadingScreen } from "@/components/common/states";
import type { CommunityPost } from "@/lib/types";

/**
 * Crowd-sourced info thread on a booth's detail page (feature: 사용자 기여 정보).
 * Posting is allowed without login; the nickname defaults to the signed-in name.
 */
export function BoothPosts({
  boothId,
  previewCount,
}: {
  boothId: string;
  /** Show only the most recent N; the rest reveal behind a "더보기". */
  previewCount?: number;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const hydrated = useHydrated();
  const myIds = hydrated ? getMyPostIds() : [];
  const seededName = useRef(false);

  async function remove(id: string) {
    try {
      await api.del(`/api/community/${id}`);
      removeMyPostId(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success(t("post.deleted"));
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : t("post.deleteFailed");
      toast.error(msg);
    }
  }

  // Fetch posts. Status starts at "loading" (initial state / retry handler),
  // so this only flips to ready/error in async callbacks — no synchronous
  // setState inside the effect body.
  const load = useCallback(() => {
    api
      .get<{ data: CommunityPost[] }>(`/api/booths/${boothId}/posts`)
      .then(({ data }) => {
        setPosts(data);
        setStatus("ready");
      })
      .catch(() => setStatus("error"));
  }, [boothId]);

  useEffect(() => load(), [load]);

  const retry = () => {
    setStatus("loading");
    load();
  };

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
    const authorName = name.trim() || t("post.anon");
    if (!user && name.trim())
      localStorage.setItem("roam-author-name", name.trim());
    try {
      const { post } = await api.post<{ post: CommunityPost }>(
        `/api/booths/${boothId}/posts`,
        { body: text, authorName },
      );
      addMyPostId(post.id);
      setPosts((prev) => [post, ...prev]);
      setBody("");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : t("post.sendFailed");
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-bold">{t("booth.postsHeading")}</h2>
        <span className="text-xs text-muted-foreground">{posts.length}개</span>
      </div>

      <div className="space-y-2 rounded-2xl border border-border bg-card p-3">
        {!user && (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("post.nickOptional")}
            maxLength={30}
            className="h-9"
            aria-label={t("post.nick")}
          />
        )}
        <div className="flex items-end gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("post.placeholder")}
            rows={2}
            maxLength={500}
            className="flex-1 resize-none"
            aria-label={t("post.write")}
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
            aria-label={t("post.send")}
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <Send className="size-5" />
            )}
          </Button>
        </div>
      </div>

      {status === "loading" && <LoadingScreen label={t("post.loading")} />}

      {status === "error" && (
        <ErrorState
          title={t("post.loadFailed")}
          description={t("post.networkError")}
          onRetry={retry}
        />
      )}

      {status === "ready" && posts.length === 0 && (
        <p className="px-1 py-4 text-center text-sm text-muted-foreground">
          아직 공유된 정보가 없어요. 첫 정보를 남겨보세요.
        </p>
      )}

      {status === "ready" && posts.length > 0 && (
        <ul className="space-y-2">
          {(showAll || previewCount == null
            ? posts
            : posts.slice(0, previewCount)
          ).map((p) => (
            <li
              key={p.id}
              className="rounded-2xl border border-border bg-card p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold">{p.authorName}</span>
                <div className="flex items-center gap-1.5">
                  <time className="text-xs text-muted-foreground">
                    {formatPostTime(p.createdAt)}
                  </time>
                  {myIds.includes(p.id) && (
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      aria-label={t("post.deleteMine")}
                      className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">
                {p.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      {status === "ready" &&
        previewCount != null &&
        !showAll &&
        posts.length > previewCount && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => setShowAll(true)}
          >
            {t("post.moreCount", { n: posts.length - previewCount })}
          </Button>
        )}
    </section>
  );
}
