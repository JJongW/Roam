import "server-only";
import { v2 as cloudinary } from "cloudinary";
import { env, hasCloudinary } from "@/lib/env";

// Media (community photos / short clips) is display-only — uploaded straight
// from the browser to Cloudinary via a server-signed signature, so large files
// never pass through our API. Not fed to the LLM.
if (hasCloudinary) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

export { cloudinary, hasCloudinary };

export const COMMUNITY_FOLDER = "roam/community";
export const NOTES_FOLDER = "roam/notes";

/** Folders the browser may request a signed upload into (allowlist). */
const UPLOAD_FOLDERS: Record<string, string> = {
  community: COMMUNITY_FOLDER,
  notes: NOTES_FOLDER,
};

/** Map a client folder key to a real folder; unknown keys fall back to community. */
export function resolveUploadFolder(key?: string | null): string {
  return (key && UPLOAD_FOLDERS[key]) || COMMUNITY_FOLDER;
}

/**
 * Destroy a community asset once its post is gone — media is display-only, so
 * it must not outlive the post (avoids orphaned files / storage leak).
 * Safe no-op when Cloudinary isn't configured. Never throws to the caller.
 */
export async function destroyMedia(
  publicId: string,
  type: "image" | "video",
): Promise<void> {
  if (!hasCloudinary) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: type });
  } catch {
    // Best-effort cleanup — a stray asset must not block post deletion.
  }
}

/**
 * Produce the params a browser needs for a signed direct upload. The secret
 * never leaves the server; the client gets only a one-time signature.
 */
export function signUpload(
  folder: string = COMMUNITY_FOLDER,
  params: Record<string, string | number> = {},
) {
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = { timestamp, folder, ...params };
  const signature = cloudinary.utils.api_sign_request(
    toSign,
    env.CLOUDINARY_API_SECRET!,
  );
  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY!,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    folder,
  };
}
