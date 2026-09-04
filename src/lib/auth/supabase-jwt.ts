import { SignJWT } from "jose";
import { env } from "@/lib/env";

// Supabase Auth를 쓰지 않고 우리 서버가 이미 검증한 로그인 결과(app_user.id)를
// Supabase 호환 JWT에 실어 클라이언트(iOS)에 준다. PostgREST/RLS는 이 JWT의
// `sub` 클레임을 auth.uid()로 읽는다 — Supabase 대시보드에 소셜 프로바이더를
// 새로 등록할 필요 없이, 기존 Apple identityToken 검증 로직 그대로 두고 RLS만
// owner-scoped로 바꿀 수 있는 이유가 이것(0041 마이그레이션 참고).
const secret = () =>
  env.SUPABASE_JWT_SECRET
    ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET)
    : null;

/** SUPABASE_JWT_SECRET 미설정이면 null — 호출자는 응답 필드를 생략해야 한다. */
export async function mintSupabaseAccessToken(
  userId: string,
): Promise<string | null> {
  const key = secret();
  if (!key) return null;

  return new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
