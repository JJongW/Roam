"use client";

import { api } from "@/lib/api/client";
import { downscaleImage } from "@/lib/image/downscale";

/** Max raw size accepted before downscaling — guards against huge originals. */
export const NOTE_PHOTO_MAX_MB = 20;
/** Max photos per booth note (kept in sync with boothNoteInputSchema). */
export const NOTE_PHOTO_MAX_COUNT = 4;

type SignResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
};

/**
 * Downscale a note photo in the browser, then upload it straight to Cloudinary
 * (roam/notes) via a server signature. Returns the secure URL. Throws on
 * failure so the caller can surface a toast.
 */
export async function uploadNotePhoto(file: File): Promise<string> {
  const small = await downscaleImage(file);
  const sign = await api.post<SignResponse>("/api/cloudinary/sign", {
    folder: "notes",
  });
  const form = new FormData();
  form.append("file", small);
  form.append("api_key", sign.apiKey);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`,
    { method: "POST", body: form },
  );
  if (!res.ok) throw new Error("upload failed");
  const j = (await res.json()) as { secure_url: string };
  return j.secure_url;
}
