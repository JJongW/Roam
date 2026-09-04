import { z } from "zod";

/**
 * Validated environment. Everything optional → the app falls back to the
 * in-memory MockRepository so it runs with zero external infrastructure.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_FCM_API_KEY: z.string().optional(),
  NEXT_PUBLIC_FCM_PROJECT_ID: z.string().optional(),
  NEXT_PUBLIC_FCM_SENDER_ID: z.string().optional(),
  NEXT_PUBLIC_FCM_APP_ID: z.string().optional(),
  NEXT_PUBLIC_FCM_VAPID_KEY: z.string().optional(),
  FCM_SERVER_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ORGANIZER_CODE: z.string().min(1).optional(),
  /** roam_user 쿠키 서명용 비밀키. 없으면 로컬 mock 개발용 고정값으로 폴백한다 —
   *  프로덕션엔 반드시 설정해야 쿠키 위조(임의 user id를 쿠키에 넣어 계정 탈취)가
   *  막힌다. */
  SESSION_SECRET: z.string().min(1).optional(),
  /** 쉼표로 구분한 admin 접근 허용 이메일(Google 로그인 검증 대상). 설정되면
   *  ORGANIZER_CODE보다 우선한다 — 신원 기반 게이트가 공유 코드보다 강하다. */
  ADMIN_EMAILS: z.string().min(1).optional(),
  /** iOS 앱 번들 ID — Sign in with Apple identityToken의 aud 검증용. */
  APPLE_BUNDLE_ID: z.string().min(1).optional(),
  /** Supabase 프로젝트의 레거시 공유 JWT secret(대시보드 Settings > API > JWT
   *  Settings). 우리 서버가 검증한 로그인 결과(app_user.id)를 실어 Supabase 호환
   *  JWT를 직접 서명하는 데 쓴다 — Supabase Auth 자체는 쓰지 않고 RLS의
   *  auth.uid()만 이 서명 검증을 통해 채워진다. 미설정이면 iOS는 기존 서버
   *  경유(anon key 노출 없음) 방식 그대로 동작한다. */
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  /** Google Cloud Console의 iOS OAuth 클라이언트 ID — Google idToken의 aud 검증용. */
  GOOGLE_IOS_CLIENT_ID: z.string().min(1).optional(),
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
});

// 빈 문자열("")을 undefined로 본다. 빈 env 변수(예: 로컬에서 Supabase를 끄려고
// `NEXT_PUBLIC_SUPABASE_URL=`로 비운 경우)가 `.url()` 같은 검증에 걸려 safeParse
// 전체를 실패시키면, env가 통째로 {}가 되어 GEMINI 같은 무관한 키까지 유실된다.
// 변수 하나의 오류가 전체를 무너뜨리지 않도록 빈 값은 미설정으로 취급한다.
const e = (v: string | undefined) => (v && v.trim() !== "" ? v : undefined);

const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: e(process.env.NEXT_PUBLIC_SUPABASE_URL),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: e(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  SUPABASE_SERVICE_ROLE_KEY: e(process.env.SUPABASE_SERVICE_ROLE_KEY),
  NEXT_PUBLIC_APP_URL: e(process.env.NEXT_PUBLIC_APP_URL),
  NEXT_PUBLIC_FCM_API_KEY: e(process.env.NEXT_PUBLIC_FCM_API_KEY),
  NEXT_PUBLIC_FCM_PROJECT_ID: e(process.env.NEXT_PUBLIC_FCM_PROJECT_ID),
  NEXT_PUBLIC_FCM_SENDER_ID: e(process.env.NEXT_PUBLIC_FCM_SENDER_ID),
  NEXT_PUBLIC_FCM_APP_ID: e(process.env.NEXT_PUBLIC_FCM_APP_ID),
  NEXT_PUBLIC_FCM_VAPID_KEY: e(process.env.NEXT_PUBLIC_FCM_VAPID_KEY),
  FCM_SERVER_KEY: e(process.env.FCM_SERVER_KEY),
  GEMINI_API_KEY: e(process.env.GEMINI_API_KEY),
  ORGANIZER_CODE: e(process.env.ORGANIZER_CODE),
  SESSION_SECRET: e(process.env.SESSION_SECRET),
  ADMIN_EMAILS: e(process.env.ADMIN_EMAILS),
  APPLE_BUNDLE_ID: e(process.env.APPLE_BUNDLE_ID),
  SUPABASE_JWT_SECRET: e(process.env.SUPABASE_JWT_SECRET),
  GOOGLE_IOS_CLIENT_ID: e(process.env.GOOGLE_IOS_CLIENT_ID),
  CLOUDINARY_CLOUD_NAME: e(process.env.CLOUDINARY_CLOUD_NAME),
  CLOUDINARY_API_KEY: e(process.env.CLOUDINARY_API_KEY),
  CLOUDINARY_API_SECRET: e(process.env.CLOUDINARY_API_SECRET),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: e(
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
      process.env.CLOUDINARY_CLOUD_NAME,
  ),
});

export const env = parsed.success
  ? parsed.data
  : ({} as z.infer<typeof schema>);

// Tolerate a SUPABASE_URL pasted with a trailing slash or the full `/rest/v1`
// path — normalize to the bare project origin so the SDK builds correct REST
// URLs (otherwise PostgREST returns PGRST125 "Invalid path specified...").
if (env.NEXT_PUBLIC_SUPABASE_URL) {
  env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL.replace(
    /\/(rest|auth|storage)\/v1\/?$/,
    "",
  ).replace(/\/+$/, "");
}

export const hasSupabase = Boolean(
  env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

export const hasFcm = Boolean(
  env.NEXT_PUBLIC_FCM_API_KEY && env.NEXT_PUBLIC_FCM_PROJECT_ID,
);

export const hasGemini = Boolean(env.GEMINI_API_KEY);

/** Cloudinary configured → community media (photo / short clip) uploads enabled. */
export const hasCloudinary = Boolean(
  env.CLOUDINARY_CLOUD_NAME &&
  env.CLOUDINARY_API_KEY &&
  env.CLOUDINARY_API_SECRET,
);

/** When set, /admin requires entering this code (organizer gate). Off if unset. */
export const hasOrganizerGate = Boolean(env.ORGANIZER_CODE);

/** roam_user 쿠키 서명 비밀키. 미설정 시 로컬 mock 개발 전용 고정값 — 프로덕션에
 *  이 상태로 배포하면 쿠키 서명이 공개된 값으로 되어 위조 방지 효과가 없다. */
export const sessionSecret =
  env.SESSION_SECRET ?? "roam-dev-only-insecure-secret";
if (!env.SESSION_SECRET && process.env.NODE_ENV === "production") {
  console.error(
    "[env] SESSION_SECRET 미설정 — roam_user 쿠키가 위조 가능한 상태로 배포되었습니다.",
  );
}

/** 쉼표 구분 문자열 → 정규화된(소문자·trim) 이메일 배열. 빈 값은 걸러낸다. */
export const adminEmailAllowlist: string[] = (env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** true면 이메일 화이트리스트가 admin 게이트를 맡는다(ORGANIZER_CODE보다 우선). */
export const hasAdminEmailGate = adminEmailAllowlist.length > 0;

/** 이메일 게이트가 실제로 작동 가능한가 — 화이트리스트가 있어도 Supabase(Google
 *  OAuth) 없인 로그인 자체가 불가능하니, 그럴 땐 조직자 코드로 폴백해야 한다.
 *  isAdminAuthed()와 AdminUnlock의 useGoogle 판정이 반드시 이 값 하나를
 *  같이 써야 한다 — 따로 계산하면(예전처럼) 둘이 어긋나 mock 개발에서
 *  admin이 완전히 잠기는 버그가 재발한다(2026-08-15). */
export const adminEmailGateActive = hasAdminEmailGate && hasSupabase;

export const dataMode: "supabase" | "mock" = hasSupabase ? "supabase" : "mock";
