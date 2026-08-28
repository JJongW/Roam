import { getRepository } from "@/lib/repositories";
import { created, fail, parseBody, setUserCookie } from "@/lib/api/http";
import { appleNativeLoginSchema } from "@/lib/schemas";
import { verifyAppleIdentityToken } from "@/lib/auth/verify-apple-token";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { readBrain } from "@/lib/memory/service";
import { env } from "@/lib/env";

const PROVIDER = "apple";

export async function POST(req: Request) {
  if (!env.APPLE_BUNDLE_ID) {
    return fail("INTERNAL", "Apple 로그인이 아직 설정되지 않았어요");
  }

  const parsed = await parseBody(req, appleNativeLoginSchema);
  if (!parsed.ok) return parsed.res;
  const { identityToken, fullName } = parsed.data;

  let claims: Awaited<ReturnType<typeof verifyAppleIdentityToken>>;
  try {
    claims = await verifyAppleIdentityToken(identityToken);
  } catch {
    return fail("UNAUTHORIZED", "로그인 정보를 확인할 수 없어요");
  }

  const repo = await getRepository();
  let appUser = await repo.getUserByProvider(PROVIDER, claims.sub);
  if (!appUser) {
    const nickname = await uniqueNickname(repo, {
      name: fullName,
      email: claims.email,
    });
    appUser = await repo.createOAuthUser({
      provider: PROVIDER,
      providerAccountId: claims.sub,
      nickname,
      email: claims.email,
    });
  }

  await setUserCookie(appUser.id);
  const needsOnboarding = (await readBrain(appUser.id)).interests.length === 0;
  return created({ user: appUser, needsOnboarding });
}
