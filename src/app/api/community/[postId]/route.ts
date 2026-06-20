import { getRepository } from "@/lib/repositories";
import { noContent, fail, withErrorBoundary } from "@/lib/api/http";
import { getSessionId } from "@/lib/api/http";
import { destroyMedia } from "@/lib/cloudinary";

type Ctx = { params: Promise<{ postId: string }> };

/** Delete a community post — only the anonymous session that wrote it may. */
export async function DELETE(_req: Request, { params }: Ctx) {
  return withErrorBoundary(async () => {
    const { postId } = await params;
    const sessionId = await getSessionId();
    if (!sessionId)
      return fail("FORBIDDEN", "본인이 작성한 글만 삭제할 수 있어요");

    const repo = await getRepository();
    const result = await repo.deletePost(postId, sessionId);
    if (!result.deleted)
      return fail("FORBIDDEN", "본인이 작성한 글만 삭제할 수 있어요");
    // Media is display-only — drop the Cloudinary asset so it doesn't orphan.
    if (result.mediaPublicId && result.mediaType)
      await destroyMedia(result.mediaPublicId, result.mediaType);
    return noContent();
  });
}
