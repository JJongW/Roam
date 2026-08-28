import { getRepository } from "@/lib/repositories";
import { created, fail, parseBody, setUserCookie } from "@/lib/api/http";
import { googleNativeLoginSchema } from "@/lib/schemas";
import { verifyGoogleIdToken } from "@/lib/auth/verify-google-token";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { readBrain } from "@/lib/memory/service";
import { env } from "@/lib/env";

const PROVIDER = "google";

export async function POST(req: Request) {
  if (!env.GOOGLE_IOS_CLIENT_ID) {
    return fail("INTERNAL", "Google 로그인이 아직 설정되지 않았어요");
  }

  const parsed = await parseBody(req, googleNativeLoginSchema);
  if (!parsed.ok) return parsed.res;
  const { idToken } = parsed.data;

  let claims: Awaited<ReturnType<typeof verifyGoogleIdToken>>;
  try {
    claims = await verifyGoogleIdToken(idToken);
  } catch {
    return fail("UNAUTHORIZED", "로그인 정보를 확인할 수 없어요");
  }

  const repo = await getRepository();
  let appUser = await repo.getUserByProvider(PROVIDER, claims.sub);
  if (!appUser) {
    const nickname = await uniqueNickname(repo, {
      name: claims.name,
      email: claims.email,
    });
    appUser = await repo.createOAuthUser({
      provider: PROVIDER,
      providerAccountId: claims.sub,
      nickname,
      email: claims.email,
      avatarUrl: claims.picture,
    });
  }

  await setUserCookie(appUser.id);
  const needsOnboarding = (await readBrain(appUser.id)).interests.length === 0;
  return created({ user: appUser, needsOnboarding });
}
