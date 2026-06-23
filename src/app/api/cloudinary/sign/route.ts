import { fail, ok, withErrorBoundary } from "@/lib/api/http";
import {
  hasCloudinary,
  resolveUploadFolder,
  signUpload,
} from "@/lib/cloudinary";

/**
 * Hand the browser a short-lived signature so it can upload a photo / short clip
 * directly to Cloudinary. The API secret stays server-side. An optional
 * `folder` key (allowlisted server-side) routes notes vs community uploads.
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasCloudinary)
      return fail("INTERNAL", "미디어 업로드가 설정되지 않았어요");
    let folderKey: string | undefined;
    try {
      const body = (await req.json()) as { folder?: string };
      folderKey = body?.folder;
    } catch {
      // no body → default (community) folder
    }
    return ok(signUpload(resolveUploadFolder(folderKey)));
  });
}
