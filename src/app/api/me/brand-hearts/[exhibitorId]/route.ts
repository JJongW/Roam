import { fail, notFound, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { recordSignal } from "@/lib/memory/service";
import { unheartBoothsOfBrand } from "@/lib/brands/follow";

type Ctx = { params: Promise<{ exhibitorId: string }> };

/** 브랜드 하트 남기기. 이미 있으면 그대로 200(여러 번 눌러도 한 줄). */
export async function PUT(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { exhibitorId } = await params;
  const repo = await getRepository();
  const heart = await repo.addBrandHeart(user.id, exhibitorId);
  if (!heart) return notFound("브랜드를 찾을 수 없어요");
  return ok({ heart: { exhibitorId: heart.exhibitorId, heartedAt: heart.createdAt } });
}

/**
 * 브랜드 하트 빼기. 없어도 200 — 기기에서 뺀 걸 나중에 올릴 때 실패로 보지 않게.
 *
 * 2026-11-24 Ted: 브랜드 하트를 빼면 그 브랜드(부스 대표 브랜드) 부스에 남긴 부스 하트도 같이 뺀다.
 * 다른 박람회 부스도 포함, 하트만(메모, 다녀왔어요, 평가는 그대로). 출처(direct, booth) 상관없이.
 *
 * 응답(200): { data: { removed, source, unheartedBoothIds } }
 * - removed: 지운 브랜드 하트 줄이 있었는지
 * - source: 지운 줄의 출처("direct" | "booth"), 줄이 없었으면 null. 되돌리기가 같은 출처로 살리려고 쓴다.
 * - unheartedBoothIds: 이번에 하트를 끈 부스 id. 클라이언트는 기기 부스 하트를 이 목록대로 끈다.
 * 예전엔 204(본문 없음)였다. 2xx를 성공으로 보는 클라이언트는 그대로 돈다.
 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { exhibitorId } = await params;
  const repo = await getRepository();
  const before = (await repo.listBrandHearts(user.id)).find((h) => h.exhibitorId === exhibitorId);
  // 부스 하트를 먼저 끈다. 그다음 브랜드 줄을 지워야 부스 쪽 따라가기가 줄을 다시 살리지 않는다.
  const unheartedBoothIds = await unheartBoothsOfBrand(repo, user.id, exhibitorId);
  for (const boothId of unheartedBoothIds) {
    await recordSignal(user.id, { kind: "heart_removed", boothId });
  }
  const removed = await repo.removeBrandHeart(user.id, exhibitorId);
  return ok({ removed, source: before?.source ?? null, unheartedBoothIds });
}
