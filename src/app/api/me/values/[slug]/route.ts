import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api/http";
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
 *
 * 204가 아니라 200 + `{ needsSeed }`를 준다 — 뮤트를 푼 뒤 되살아난 confidence가
 * 정말 0인지는 서버만 안다(뮤트된 가치는 interests에서 빠져 내려가서 클라 값은
 * 항상 0이다). 이 답 없이 클라가 자체 판단하면 이력이 두둑한 가치도 토글할 때마다
 * 명시 신호가 하나씩 더 쌓인다.
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

  const { needsSeed } = await setValueMuted(user.id, slug, parsed.data.muted);
  return ok({ needsSeed });
}
