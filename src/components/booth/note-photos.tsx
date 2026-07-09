"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { useAuthStore } from "@/lib/stores/auth";
import {
  uploadNotePhoto,
  NOTE_PHOTO_MAX_COUNT,
  NOTE_PHOTO_MAX_MB,
} from "@/lib/notes/upload-photo";

/** Stable empty array so the store selector never returns a fresh reference. */
const EMPTY: string[] = [];

/**
 * Personal photo attachments for a booth note. Photos are downscaled in the
 * browser, uploaded to Cloudinary (roam/notes), and stored as URLs on the
 * visit record (synced to the server when signed in). Shared by the map popup
 * (compact) and the booth detail panel.
 */
export function NotePhotos({
  boothId,
  compact = false,
}: {
  boothId: string;
  compact?: boolean;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  // Select the raw value (stable ref) — applying `?? []` *inside* the selector
  // would return a fresh array each render and loop the store forever.
  const photos = useVisitStore((s) => s.records[boothId]?.photos) ?? EMPTY;
  const setPhotos = useVisitStore((s) => s.setPhotos);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const full = photos.length >= NOTE_PHOTO_MAX_COUNT;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const room = NOTE_PHOTO_MAX_COUNT - photos.length;
    if (room <= 0) {
      toast.error(`사진은 최대 ${NOTE_PHOTO_MAX_COUNT}장까지 첨부할 수 있어요`);
      return;
    }
    const picked = files.slice(0, room);
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const file of picked) {
        if (file.size > NOTE_PHOTO_MAX_MB * 1024 * 1024) {
          toast.error(`${NOTE_PHOTO_MAX_MB}MB 이하 사진만 올릴 수 있어요`);
          continue;
        }
        urls.push(await uploadNotePhoto(file));
      }
      if (urls.length === 0) return;
      const next = [...photos, ...urls].slice(0, NOTE_PHOTO_MAX_COUNT);
      setPhotos(boothId, next);
      if (user) void pushNote(boothId);
      toast.success(
        urls.length > 1
          ? `사진 ${urls.length}장을 첨부했어요`
          : t("notes.photoAttached"),
      );
    } catch {
      toast.error(t("notes.photoFailed"));
    } finally {
      setBusy(false);
    }
  }

  function remove(url: string) {
    setPhotos(
      boothId,
      photos.filter((p) => p !== url),
    );
    if (user) void pushNote(boothId);
  }

  const thumb = compact ? "size-14" : "size-20";

  return (
    <div className={cn("flex flex-wrap gap-2", compact ? "mt-2" : "mt-1")}>
      {photos.map((url) => (
        <div
          key={url}
          className={cn(
            "group relative overflow-hidden rounded-lg border border-border bg-secondary",
            thumb,
          )}
        >
          <Image
            src={url}
            alt={t("notes.photoAria")}
            fill
            sizes="80px"
            className="object-cover"
            unoptimized
          />
          <button
            type="button"
            onClick={() => remove(url)}
            aria-label={t("notes.photoDelete")}
            className="absolute right-0.5 top-0.5 flex size-5 items-center justify-center rounded-full bg-black/55 text-white"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}

      {!full && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={t("notes.photoAdd")}
          className={cn(
            "flex flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-border bg-card text-muted-foreground transition-colors active:bg-accent/40 disabled:opacity-60",
            thumb,
          )}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="size-5" />
              {!compact && (
                <span className="text-[11px]">{t("notes.photoLabel")}</span>
              )}
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={onPick}
      />
    </div>
  );
}
