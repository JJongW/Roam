import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { classifyForUser } from "@/lib/memory/service";

type Ctx = { params: Promise<{ boothId: string }> };

const schema = z.object({ liked: z.boolean() });

// '가봄'(visited) 부스의 뒤늦은 호불호 답 — "여기 어땠어?"(지도 시트) 또는 관람
// 마치기 일괄 되묻기에서 온다. status는 그대로 visited로 두고(지도 색 안 바뀜)
// retro·judged_class만 채운다. judged_class는 이 요청 순간 계산해 얼린다 — 가봄
// 자체는 무판정이라 얼릴 게 없고, 실제 판정은 되묻기에 답하는 지금 드러난다.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const booth = await repo.getBooth(boothId);
  if (!booth) return fail("NOT_FOUND", "부스를 찾을 수 없어요");

  const judgedClass = await classifyForUser(booth, user.id);
  const note = await repo.setBoothRetro(
    user.id,
    boothId,
    parsed.data.liked ? "liked" : "disliked",
    judgedClass,
  );
  const taste = await repo.getTasteAccuracy(user.id, booth.exhibitionId);
  return ok({ note, taste });
}
