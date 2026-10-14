import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 인스타 장기 토큰(60일) 갱신. 갱신한 토큰은 `ig_token`(0059, 한 줄짜리 표)에 두고,
 * 웹훅·게시 CLI는 **저장된 토큰 > env 토큰** 순으로 쓴다. env(Vercel)는 코드가
 * 고칠 수 없어서 첫 토큰을 대 주는 역할만 한다.
 *
 * Vercel cron(`/api/cron/ig-token-refresh`)이 매일 부르고, 마지막 갱신에서
 * REFRESH_AFTER_DAYS가 지났을 때만 실제로 갱신한다 — 한 번 실패해도 만료까지
 * 50번 넘게 다시 시도할 기회가 있다.
 *
 * 토큰을 다시 발급받아 env를 바꿨다면 `ig_token` 행을 지워야 새 env 토큰이 쓰인다.
 */
export const REFRESH_AFTER_DAYS = 7;

export interface StoredToken {
  accessToken: string;
  expiresAt?: string;
  refreshedAt: string;
}

export interface TokenStore {
  read(): Promise<StoredToken | null>;
  write(t: StoredToken): Promise<void>;
}

export function createTokenStore(db: SupabaseClient): TokenStore {
  return {
    async read() {
      const { data, error } = await db
        .from("ig_token")
        .select("access_token, expires_at, refreshed_at")
        .eq("id", 1)
        .maybeSingle();
      // PostgREST는 throw하지 않는다 — 실패를 "토큰 없음"으로 보면 안 된다.
      if (error) throw new Error(`ig_token 읽기 실패: ${error.message}`);
      if (!data) return null;
      return { accessToken: data.access_token, expiresAt: data.expires_at ?? undefined, refreshedAt: data.refreshed_at };
    },
    async write(t) {
      const { error } = await db.from("ig_token").upsert({
        id: 1,
        access_token: t.accessToken,
        expires_at: t.expiresAt ?? null,
        refreshed_at: t.refreshedAt,
      });
      if (error) throw new Error(`ig_token 쓰기 실패: ${error.message}`);
    },
  };
}

/** 쓸 토큰. 저장소를 못 읽으면(마이그레이션 전 등) 로그를 남기고 env 토큰으로 간다. */
export async function loadIgToken(store: TokenStore | null, fallback?: string): Promise<string | undefined> {
  if (store) {
    try {
      const t = await store.read();
      if (t) return t.accessToken;
    } catch (e) {
      console.error(`[ig-token] ${e instanceof Error ? e.message : String(e)} — env 토큰으로`);
    }
  }
  return fallback;
}

export type RefreshResult =
  | { status: "refreshed"; expiresAt: string }
  | { status: "fresh"; refreshedAt: string }
  | { status: "no-token" };

export async function refreshIgToken(
  store: TokenStore,
  fallback: string | undefined,
  { now = new Date(), fetchImpl = fetch }: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<RefreshResult> {
  const stored = await store.read();
  if (stored && now.getTime() - Date.parse(stored.refreshedAt) < REFRESH_AFTER_DAYS * 86_400_000) {
    return { status: "fresh", refreshedAt: stored.refreshedAt };
  }
  const current = stored?.accessToken ?? fallback;
  if (!current) return { status: "no-token" };

  // 갱신 엔드포인트는 버전 경로가 없다. 토큰은 발급 24시간 뒤부터, 만료 전까지만 갱신된다.
  const url = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(current)}`;
  const res = await fetchImpl(url);
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string; code?: number };
  };
  if (!res.ok || !json.access_token) {
    // 메시지에 토큰이 섞이지 않게 Graph의 에러 문구만 쓴다.
    throw new Error(`토큰 갱신 실패 ${res.status}: ${json.error?.message ?? res.statusText} (code ${json.error?.code ?? "?"})`);
  }
  const expiresAt = new Date(now.getTime() + (json.expires_in ?? 60 * 86_400) * 1000).toISOString();
  await store.write({ accessToken: json.access_token, expiresAt, refreshedAt: now.toISOString() });
  return { status: "refreshed", expiresAt };
}
