"use client";

import { useState } from "react";
import { Star, Loader2, PencilLine } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/api/client";
import { reviewInputSchema } from "@/lib/schemas";
import { Rating } from "@/components/common/rating";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Review } from "@/lib/types";

export function ReviewSection({
  boothId,
  initialReviews,
  initialSummary,
}: {
  boothId: string;
  initialReviews: Review[];
  initialSummary: { avg: number; count: number };
}) {
  const [reviews, setReviews] = useState(initialReviews);
  const [summary, setSummary] = useState(initialSummary);
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    const parsed = reviewInputSchema.safeParse({ rating, comment, authorName: author || "익명" });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "입력을 확인해 주세요");
      return;
    }
    setBusy(true);
    try {
      const { review } = await api.post<{ review: Review }>(`/api/booths/${boothId}/reviews`, parsed.data);
      const next = [review, ...reviews];
      setReviews(next);
      setSummary({
        count: next.length,
        avg: Number((next.reduce((s, r) => s + r.rating, 0) / next.length).toFixed(2)),
      });
      setComment("");
      setAuthor("");
      setOpen(false);
      toast.success("리뷰가 등록되었어요");
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "등록에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">
          리뷰 <span className="text-muted-foreground">{summary.count}</span>
        </h2>
        {summary.count > 0 && <Rating value={summary.avg} showValue />}
      </div>

      {!open ? (
        <Button variant="outline" className="w-full" onClick={() => setOpen(true)}>
          <PencilLine className="size-4" /> 리뷰 작성하기
        </Button>
      ) : (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <div className="space-y-1.5">
            <Label>별점</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n}점`}>
                  <Star className={cn("size-8", n <= rating ? "fill-warning text-warning" : "fill-secondary text-secondary")} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rv-comment">내용</Label>
            <Textarea
              id="rv-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="부스는 어땠나요?"
              maxLength={500}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rv-author">닉네임</Label>
            <Input id="rv-author" value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="익명" maxLength={30} />
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setOpen(false)} disabled={busy}>
              취소
            </Button>
            <Button className="flex-1" onClick={submit} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />} 등록
            </Button>
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <EmptyState title="아직 리뷰가 없어요" description="첫 번째 리뷰를 남겨보세요." />
      ) : (
        <ul className="space-y-2.5">
          {reviews.map((r) => (
            <li key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.authorName}</span>
                <Rating value={r.rating} size={14} />
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/90">{r.comment}</p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {format(new Date(r.createdAt), "yyyy.M.d")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
