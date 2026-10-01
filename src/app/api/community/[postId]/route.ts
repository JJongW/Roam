import { getRepository } from "@/lib/repositories";
import { noContent, fail, withErrorBoundary } from "@/lib/api/http";
import { getUserId } from "@/lib/api/http";
import { destroyMedia } from "@/lib/cloudinary";

type Ctx = { params: Promise<{ postId: string }> };

/** Delete a community post — only the account that wrote it may (0056). */
export async function DELETE(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const { postId } = await params;
    const userId = await getUserId();
    if (!userId)
      return fail("FORBIDDEN", "본인이 작성한 글만 삭제할 수 있어요");

    const repo = await getRepository();
    const result = await repo.deletePost(postId, userId);
    if (!result.deleted)
      return fail("FORBIDDEN", "본인이 작성한 글만 삭제할 수 있어요");
    // Media is display-only — drop the Cloudinary asset so it doesn't orphan.
    if (result.mediaPublicId && result.mediaType)
      await destroyMedia(result.mediaPublicId, result.mediaType);
    return noContent();
  });
}
