import { fail, ok, withErrorBoundary } from "@/lib/api/http";
import { hasCloudinary, signUpload } from "@/lib/cloudinary";

/**
 * Hand the browser a short-lived signature so it can upload a community photo /
 * short clip directly to Cloudinary. The API secret stays server-side.
 */
export async function POST() {
  return withErrorBoundary(async () => {
    if (!hasCloudinary)
      return fail("INTERNAL", "미디어 업로드가 설정되지 않았어요");
    return ok(signUpload());
  });
}
