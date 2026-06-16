import { hasSupabase } from "@/lib/env";
import { MockRepository } from "@/lib/mock/repository";
import type { Repository } from "@/lib/repositories/types";

let cached: Repository | null = null;

/**
 * Returns the active data repository.
 * - Supabase-backed when credentials are present.
 * - In-memory MockRepository otherwise (default), so the app runs with no infra.
 */
export async function getRepository(): Promise<Repository> {
  if (cached) return cached;
  if (hasSupabase) {
    const { SupabaseRepository } = await import("@/lib/supabase/repository");
    cached = new SupabaseRepository();
  } else {
    cached = new MockRepository();
  }
  return cached;
}

export type { Repository } from "@/lib/repositories/types";
