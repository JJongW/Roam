import { z } from "zod";
import { created, fail, noContent, notFound, parseBody } from "@/lib/api/http";
import { ensureSession, getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { pushDeviceSchema, pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/schemas";

// 두 모양을 받는다.
// - iOS { platform: "ios", token, environment, anonId?, appVersion? } → push_device(0067)에 저장한다.
//   로그인했으면(Bearer나 쿠키) 그 계정에 묶고, 아니면 anonId만 남긴다. 브랜드 알림은 계정에
//   묶인 토큰에만 보낸다(2026-11-17 Ted 결정) — 보내기는 아직 없다.
// - 웹 옛 모양 { token } → 저장하지 않고 받았다고만 답한다(FCM 키가 없어 웹 푸시는 꺼져 있다).
const bodySchema = z.union([pushDeviceSchema, pushSubscribeSchema]);

export async function POST(req: Request) {
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  if (!("platform" in parsed.data)) {
    const session = await ensureSession();
    return created({ sessionId: session.id, token: parsed.data.token });
  }
  const input = parsed.data;
  const user = await getCurrentUser();
  if (!user && !input.anonId) {
    return fail("VALIDATION", "로그인하거나 anonId를 보내야 해요");
  }
  const repo = await getRepository();
  const device = await repo.upsertPushDevice({
    token: input.token,
    environment: input.environment,
    userId: user?.id ?? null,
    anonId: input.anonId,
    appVersion: input.appVersion,
  });
  return created({
    device: {
      id: device.id,
      environment: device.environment,
      linkedToAccount: device.userId != null,
    },
  });
}

/** 이 기기 토큰을 끊는다(알림 끄기, 앱이 토큰을 잃었을 때). 로그아웃만으로는 부르지 않아도 된다. */
export async function DELETE(req: Request) {
  const parsed = await parseBody(req, pushUnsubscribeSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const ok = await repo.revokePushDevice(parsed.data.token);
  return ok ? noContent() : notFound("등록된 기기가 없어요");
}
