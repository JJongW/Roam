import { z } from "zod";
import { fail, noContent, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { setValueMuted } from "@/lib/memory/service";
import { VALUE_SLUGS } from "@/lib/values";

type Ctx = { params: Promise<{ slug: string }> };

const schema = z.object({ muted: z.boolean() });

/**
 * 가치 하나를 끄거나 켠다(브레인 시트의 "관심 고치기").
 *
 * POST /api/me/values(추가)와 짝이다. 추가는 명시 긍정 신호를 남기고, 이쪽은
 * 신호를 건드리지 않고 표시에서만 뺀다 — 원장은 append-only라 지울 수 없고,
 * 끄는 것은 과거 행동의 부정이 아니라 현재 상태 선언이기 때문이다.
 *
 * PUT인 이유: 멱등하다. 같은 요청을 두 번 보내도 결과가 같다.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { slug } = await params;
  if (!VALUE_SLUGS.includes(slug)) {
    return fail("VALIDATION", "알 수 없는 관심이에요");
  }
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  await setValueMuted(user.id, slug, parsed.data.muted);
  return noContent();
}
