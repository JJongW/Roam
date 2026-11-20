import { notFound, ok, withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";
import { isPublishable, publicArticle } from "@/lib/articles/decision";

type Ctx = { params: Promise<{ id: string }> };

/** 승인된 아티클 한 편(공개). draft와 rejected는 있어도 404 — 있는지조차 알리지 않는다. */
export async function GET(req: Request, { params }: Ctx) {
  return withErrorBoundary(req, async () => {
    const { id } = await params;
    const repo = await getRepository();
    const a = await repo.getArticle(id);
    if (!a || !isPublishable(a)) return notFound("아티클을 찾을 수 없어요");
    return ok({ article: publicArticle(a) });
  });
}
