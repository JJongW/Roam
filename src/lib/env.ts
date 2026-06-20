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
  CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
  CLOUDINARY_API_KEY: z.string().min(1).optional(),
  CLOUDINARY_API_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: z.string().min(1).optional(),
});

const parsed = schema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_FCM_API_KEY: process.env.NEXT_PUBLIC_FCM_API_KEY,
  NEXT_PUBLIC_FCM_PROJECT_ID: process.env.NEXT_PUBLIC_FCM_PROJECT_ID,
  NEXT_PUBLIC_FCM_SENDER_ID: process.env.NEXT_PUBLIC_FCM_SENDER_ID,
  NEXT_PUBLIC_FCM_APP_ID: process.env.NEXT_PUBLIC_FCM_APP_ID,
  NEXT_PUBLIC_FCM_VAPID_KEY: process.env.NEXT_PUBLIC_FCM_VAPID_KEY,
  FCM_SERVER_KEY: process.env.FCM_SERVER_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  ORGANIZER_CODE: process.env.ORGANIZER_CODE,
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME:
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ??
    process.env.CLOUDINARY_CLOUD_NAME,
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

export const dataMode: "supabase" | "mock" = hasSupabase ? "supabase" : "mock";
