"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { CartButton } from "@/components/booth/cart-button";
import { WaitingBadge } from "@/components/booth/waiting-badge";
import { CategoryChip } from "@/components/booth/category-chip";
import type { Booth, Category, Waiting } from "@/lib/types";

interface Candidate {
  booth: Booth;
  confidence: number;
  term: string;
}

/** Downscale any image to a ≤1600px JPEG and return bare base64 (no data: prefix).
 *  Normalizes mime (HEIC/PNG/… → jpeg) and trims payload before upload. */
function fileToJpegBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      resolve({ data: dataUrl.split(",")[1] ?? "", mimeType: "image/jpeg" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했어요"));
    };
    img.src = url;
  });
}

/**
 * "캡처로 담기" — visitor picks an Instagram screenshot; AI reads it and we match
 * publishers/brands to real booths, then confirm before saving ("이 부스 같아요,
 * 담을까요?"). Matching is server-side deterministic, so no-match is honest.
 */
export function ScreenshotCapture({
  slug,
  categories,
  waitings,
}: {
  slug: string;
  categories: Category[];
  waitings: Record<string, Waiting>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [unmatched, setUnmatched] = useState<string[]>([]);

  const catById = new Map(categories.map((c) => [c.id, c]));

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    setLoading(true);
    try {
      const image = await fileToJpegBase64(file);
      const res = await api.post<{
        candidates: Candidate[];
        unmatched: string[];
        detectedCount: number;
      }>("/api/ai/screenshot", {
        exhibitionSlug: slug,
        image: image.data,
        mimeType: image.mimeType,
      });
      setCandidates(res.candidates);
      setUnmatched(res.unmatched);
      setOpen(true);
      if (res.candidates.length === 0) {
        toast(
          res.detectedCount > 0
            ? "닮은 부스를 찾지 못했어요"
            : "스크린샷에서 부스를 못 읽었어요",
        );
      }
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.error.message : "판독에 실패했어요";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
      <button
        type="button"
        aria-label="캡처로 부스 담기"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors active:bg-accent/40 disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="size-4.5 animate-spin" />
        ) : (
          <ImagePlus className="size-4.5" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <button
            type="button"
            aria-label="닫기"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative z-10 max-h-[80dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 pb-safe shadow-[var(--shadow-pop)]">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-base font-extrabold">
                <Sparkles className="size-4.5 text-primary" /> 이 부스 같아요
              </h2>
              <button
                type="button"
                aria-label="닫기"
                onClick={() => setOpen(false)}
                className="flex size-8 items-center justify-center rounded-full hover:bg-secondary"
              >
                <X className="size-5" />
              </button>
            </div>

            {candidates.length > 0 ? (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  스크린샷에서 찾은 부스예요. 담을 것만 골라 담아주세요.
                </p>
                <div className="space-y-1.5">
                  {candidates.map((c) => (
                    <div
                      key={c.booth.id}
                      className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {c.booth.name}
                          {c.booth.code && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              {c.booth.code}
                            </span>
                          )}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.booth.company}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {catById.get(c.booth.categoryId) && (
                            <CategoryChip
                              category={catById.get(c.booth.categoryId)!}
                            />
                          )}
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                              c.confidence >= 1
                                ? "bg-success/15 text-success"
                                : "bg-warning/15 text-[#9a6700]",
                            )}
                          >
                            {c.confidence >= 1 ? "거의 확실" : "비슷해요"} ·{" "}
                            {c.term}
                          </span>
                          <WaitingBadge waiting={waitings[c.booth.id]} />
                        </div>
                      </div>
                      <CartButton boothId={c.booth.id} variant="icon" />
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                닮은 부스를 찾지 못했어요. 부스명으로 검색해 보세요.
              </p>
            )}

            {unmatched.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  못 찾은 항목: {unmatched.join(", ")}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
