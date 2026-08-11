"use client";

import { api } from "@/lib/api/client";
import { downscaleImage } from "@/lib/image/downscale";

/** Max raw size accepted before downscaling — guards against huge originals. */
export const BOOTH_IMAGE_MAX_MB = 20;
/** Max images per booth — keeps the gallery scannable in the admin form. */
export const BOOTH_IMAGE_MAX_COUNT = 8;

type SignResponse = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
};

/**
 * Downscale a booth image in the browser, then upload it straight to
 * Cloudinary (roam/booths) via a server signature — same pattern as
 * upload-photo.ts's uploadNotePhoto, different folder. Returns the secure
 * URL. Throws on failure so the caller can surface a toast.
 */
export async function uploadBoothImage(file: File): Promise<string> {
  const small = await downscaleImage(file);
  const sign = await api.post<SignResponse>("/api/cloudinary/sign", {
    folder: "booth",
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
