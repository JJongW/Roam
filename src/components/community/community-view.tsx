"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  MapPin,
  MessagesSquare,
  Send,
  Loader2,
  Search,
  X,
  Sparkles,
  Trash2,
  Flag,
} from "lucide-react";
import { toast } from "sonner";
import { formatPostTime } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/api/client";
import { addMyPostId, getMyPostIds, removeMyPostId } from "@/lib/my-posts";
import { useHydrated } from "@/lib/hooks/use-hydrated";
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
  aiEnabled = false,
}: {
  slug: string;
  booths: Booth[];
  initialPosts: CommunityPost[];
  aiEnabled?: boolean;
}) {
  const [posts, setPosts] = useState<CommunityPost[]>(initialPosts);
  const [body, setBody] = useState("");
  const [name, setName] = useState("");
  const [boothId, setBoothId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<string[]>([]);
  const hydrated = useHydrated();
  // Posts written on this device (delete affordance; server re-checks owner).
  // Read in render (gated by hydration) so server/first paint match — re-reads
  // whenever posts change, so create/delete stay in sync without extra state.
  const myIds = hydrated ? getMyPostIds() : [];

  // Posts this device already reported (local hint; the server dedupes too).
  const [reportedIds, setReportedIds] = useState<string[]>([]);

  async function remove(id: string) {
    try {
      await api.del(`/api/community/${id}`);
      removeMyPostId(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      toast.success("글을 삭제했어요");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "삭제하지 못했어요";
      toast.error(msg);
    }
  }

  async function report(id: string) {
    if (reportedIds.includes(id)) return;
    if (!window.confirm("이 글을 신고할까요? 여러 명이 신고하면 숨겨져요."))
      return;
    try {
      const r = await api.post<{ already: boolean }>(
        `/api/community/${id}/report`,
        {},
      );
      setReportedIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      toast.success(r.already ? "이미 신고한 글이에요" : "신고를 접수했어요");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "신고하지 못했어요";
      toast.error(msg);
    }
  }

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

  // AI summary of visitor reports (crowd-sourced — explicitly NOT official).
  useEffect(() => {
    if (!aiEnabled) return;
    let cancelled = false;
    api
      .post<{ summary: string[] }>("/api/ai/community-summary", {
        exhibitionSlug: slug,
      })
      .then((r) => {
        if (!cancelled) setSummary(r.summary ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, aiEnabled]);

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
      addMyPostId(post.id);
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
        {summary.length > 0 && (
          <div className="mb-3 rounded-2xl border border-border bg-secondary/40 p-3.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-muted-foreground" aria-hidden />
              <p className="text-sm font-bold">방문자 제보 요약</p>
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground">
                AI · 공식 정보 아님
              </span>
            </div>
            <ul className="mt-1.5 space-y-1">
              {summary.map((s, i) => (
                <li
                  key={i}
                  className="flex gap-1.5 text-[13px] leading-snug text-foreground/90"
                >
                  <span className="text-muted-foreground">·</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
                    <div className="flex items-center gap-1.5">
                      <time className="text-xs text-muted-foreground">
                        {formatPostTime(p.createdAt)}
                      </time>
                      {myIds.includes(p.id) ? (
                        <button
                          type="button"
                          onClick={() => remove(p.id)}
                          aria-label="내 글 삭제"
                          className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => report(p.id)}
                          disabled={reportedIds.includes(p.id)}
                          aria-label={
                            reportedIds.includes(p.id) ? "신고 완료" : "글 신고"
                          }
                          className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <Flag className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">
                    {p.body}
                  </p>
                  {booth && (
                    <Link
                      href={`/booths/${booth.id}`}
                      className="mt-2 inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground"
                    >
                      <MapPin className="size-3.5 text-muted-foreground" />
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
      <div className="border-t border-border bg-background p-3 pb-safe relative">
        <div className="mb-2 space-y-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="닉네임 (선택)"
            maxLength={30}
            className="h-9"
            aria-label="닉네임"
          />
          <BoothTagPicker
            booths={booths}
            value={boothId}
            onChange={setBoothId}
          />
          <p className="px-0.5 text-[11px] text-muted-foreground">
            닉네임 없이 익명으로 게시할 수 있어요. 게시글은 전시 참가자에게
            공개되며, 본인이 쓴 글은 삭제하고, 부적절한 글은 신고할 수 있어요.
          </p>
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

/** Searchable booth tag picker — replaces a 100+ option <select>. */
function BoothTagPicker({
  booths,
  value,
  onChange,
}: {
  booths: Booth[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = value ? booths.find((b) => b.id === value) : undefined;

  if (selected) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm">
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-semibold">
          {selected.name}
          {selected.code ? ` (${selected.code})` : ""}
        </span>
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="부스 태그 제거"
          className="rounded-full p-0.5 hover:bg-secondary"
        >
          <X className="size-4" />
        </button>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q
    ? booths
        .filter((b) => `${b.name} ${b.code ?? ""}`.toLowerCase().includes(q))
        .slice(0, 8)
    : [];

  return (
    <div className="relative">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="부스 태그 검색 (선택)"
        className="h-9 pl-8"
        aria-label="관련 부스 검색"
      />
      {open && matches.length > 0 && (
        <ul className="absolute bottom-full z-10 mb-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card py-1 shadow-[var(--shadow-pop)]">
          {matches.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(b.id);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                {b.code && (
                  <span className="w-12 shrink-0 text-xs font-bold text-muted-foreground">
                    {b.code}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate">{b.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
