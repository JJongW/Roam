import { getRepository } from "@/lib/repositories";
import { created, fail, parseBody, setUserCookie } from "@/lib/api/http";
import { appleLinkProfileSchema } from "@/lib/schemas";
import { getSupabaseUserFromBearer } from "@/lib/auth/supabase-bearer-user";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { readBrain } from "@/lib/memory/service";

// iOS는 Apple identityToken을 우리 서버가 아니라 Supabase Auth(signInWithIdToken)에
// 직접 검증받는다 — 그 결과로 받은 access token을 여기 Authorization 헤더로 보내면,
// 이 라우트는 신원만 재확인하고 app_user 프로필(닉네임 등)을 찾거나 만든다. 검증
// 로직 자체(jose + Apple JWKS)를 우리가 들고 있던 옛 apple/native 라우트는 이걸로
// 대체됐다 — Supabase 대시보드에 Apple 프로바이더 등록이 그 검증을 대신한다.
//
// app_user.id를 authUser.id(Supabase auth.uid())와 같은 값으로 만든다(OAuthIdentity.id)
// — 그래야 0041의 owner-scoped RLS(auth.uid() = user_id)가 별도 매핑 테이블 없이
// iOS의 직접 Supabase 접근에 그대로 먹는다.
const PROVIDER = "apple_ios";

export async function POST(req: Request) {
  const parsed = await parseBody(req, appleLinkProfileSchema);
  if (!parsed.ok) return parsed.res;
  const { fullName } = parsed.data;

  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const authUser = token ? await getSupabaseUserFromBearer(token) : null;
  if (!authUser) {
    return fail("UNAUTHORIZED", "로그인 정보를 확인할 수 없어요");
  }

  const repo = await getRepository();
  let appUser = await repo.getUserByProvider(PROVIDER, authUser.id);
  if (!appUser) {
    const nickname = await uniqueNickname(repo, {
      name: fullName,
      email: authUser.email,
    });
    appUser = await repo.createOAuthUser({
      id: authUser.id,
      provider: PROVIDER,
      providerAccountId: authUser.id,
      nickname,
      email: authUser.email,
    });
  }

  await setUserCookie(appUser.id);
  const needsOnboarding = (await readBrain(appUser.id)).interests.length === 0;
  return created({ user: appUser, needsOnboarding });
}
