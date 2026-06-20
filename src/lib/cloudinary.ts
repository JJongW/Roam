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

/**
 * Produce the params a browser needs for a signed direct upload. The secret
 * never leaves the server; the client gets only a one-time signature.
 */
export function signUpload(params: Record<string, string | number> = {}) {
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = { timestamp, folder: COMMUNITY_FOLDER, ...params };
  const signature = cloudinary.utils.api_sign_request(
    toSign,
    env.CLOUDINARY_API_SECRET!,
  );
  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY!,
    cloudName: env.CLOUDINARY_CLOUD_NAME!,
    folder: COMMUNITY_FOLDER,
  };
}
