import { getRepository } from "@/lib/repositories";
import { created, fail, parseBody, setUserCookie } from "@/lib/api/http";
import { googleNativeLoginSchema } from "@/lib/schemas";
import { verifyGoogleIdToken } from "@/lib/auth/verify-google-token";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { readBrain } from "@/lib/memory/service";
import { env } from "@/lib/env";

// 웹 OAuth 콜백(/auth/callback)은 provider="google" + Supabase GoTrue UUID를 쓴다.
// 여기는 의도적으로 다른 provider 문자열(google_ios)을 써서 identity 공간을 분리한다 —
// 같은 provider="google"에 providerAccountId 공간만 다르면(UUID vs Google 실제 sub)
// 유니크 인덱스 충돌 없이 조용히 별개 계정 두 개가 생기는데, 그게 스키마만 보고는 실수처럼
// 보인다. 후속 계정 병합 여부는 아직 미결 — 상세 근거는 설계 스펙 §8 참고.
const PROVIDER = "google_ios";

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
