import { getRepository } from "@/lib/repositories";
import { ok, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { reportInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ postId: string }> };

/** Report a community post for abuse. Deduped per reporter session. */
export async function POST(req: Request, { params }: Ctx) {
  return withErrorBoundary(async () => {
    const { postId } = await params;
    const parsed = await parseBody(req, reportInputSchema);
    if (!parsed.ok) return parsed.res;

    const repo = await getRepository();
    const post = await repo.getPost(postId);
    if (!post) return notFound("글을 찾을 수 없습니다");

    // Tie any freshly created session to the post's exhibition (a bare
    // ensureSession() would use an invalid placeholder exhibition id).
    const session = await ensureSession(post.exhibitionId);
    const result = await repo.reportPost(
      postId,
      session.id,
      parsed.data.reason,
    );
    if (!result.ok) return notFound("글을 찾을 수 없습니다");
    return ok({ already: result.already });
  });
}
