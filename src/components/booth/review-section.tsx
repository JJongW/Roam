"use client";

import { useState } from "react";
import { Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { api, ApiClientError } from "@/lib/api/client";
import { reviewInputSchema } from "@/lib/schemas";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/provider";
import type { Review } from "@/lib/types";

export function ReviewSection({
  boothId,
  initialReviews,
  initialSummary,
  previewCount,
}: {
  boothId: string;
  initialReviews: Review[];
  initialSummary: { count: number };
  /** Show only the most recent N; the rest reveal behind a "더보기". */
  previewCount?: number;
}) {
  const t = useT();
  const [reviews, setReviews] = useState(initialReviews);
  const [summary, setSummary] = useState(initialSummary);
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [comment, setComment] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = reviewInputSchema.safeParse({
      comment,
      authorName: author || t("review.anon"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? t("review.checkInput"));
      return;
    }
    setBusy(true);
    try {
      const { review } = await api.post<{ review: Review }>(
        `/api/booths/${boothId}/reviews`,
        parsed.data,
      );
      const next = [review, ...reviews];
      setReviews(next);
      setSummary({ count: next.length });
      setComment("");
      setAuthor("");
      setOpen(false);
      toast.success(t("review.posted"));
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.error.message : t("review.failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">
          후기 <span className="text-muted-foreground">{summary.count}</span>
        </h2>
      </div>

      {!open ? (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setOpen(true)}
        >
          <PencilLine className="size-4" /> 후기 작성하기
        </Button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="rv-comment">내용</Label>
            <Textarea
              id="rv-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("review.prompt")}
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rv-author">닉네임</Label>
            <Input
              id="rv-author"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder={t("review.anon")}
              maxLength={30}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              취소
            </Button>
            <Button className="flex-1" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} 등록
            </Button>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <EmptyState
          title={t("review.empty")}
          description={t("review.emptyDesc")}
        />
      ) : (
        <>
          <ul className="space-y-2.5">
            {(showAll || previewCount == null
              ? reviews
              : reviews.slice(0, previewCount)
            ).map((r) => (
              <li
                key={r.id}
                className="rounded-2xl border border-border bg-card p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{r.authorName}</span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">
                  {r.comment}
                </p>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {format(new Date(r.createdAt), "yyyy.M.d")}
                </p>
              </li>
            ))}
          </ul>
          {previewCount != null &&
            !showAll &&
            reviews.length > previewCount && (
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setShowAll(true)}
              >
                후기 {reviews.length - previewCount}개 {t("review.more")}
              </Button>
            )}
        </>
      )}
    </section>
  );
}
