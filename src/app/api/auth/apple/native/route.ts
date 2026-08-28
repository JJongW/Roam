import { getRepository } from "@/lib/repositories";
import { created, fail, parseBody, setUserCookie } from "@/lib/api/http";
import { appleNativeLoginSchema } from "@/lib/schemas";
import { verifyAppleIdentityToken } from "@/lib/auth/verify-apple-token";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { readBrain } from "@/lib/memory/service";
import { env } from "@/lib/env";

// 웹은 현재 Apple 로그인 경로가 없다(Google OAuth만, login-form.tsx 확인함) — 그래서
// 여기엔 오늘 시점 충돌할 기존 identity 공간이 없다. 그래도 google_ios와 컨벤션을
// 맞춰 apple_ios로 둔다 — 웹에 Apple 로그인이 나중에 생겼을 때 똑같은 문제가 반복되지
// 않도록. 상세 근거는 설계 스펙 §8 참고.
const PROVIDER = "apple_ios";

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
