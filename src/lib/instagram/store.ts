import { hasSupabase } from "@/lib/env";
import { createServiceClient } from "@/lib/supabase/server";
import type { HandleDeps } from "./handle";

// 로컬 개발 전용 — Supabase 없이 돌릴 때만 쓴다. 서버리스 인스턴스마다 따로라
// 운영에선 중복 방지가 되지 않는다.
const memoryClaims = new Set<string>();

/**
 * 댓글 → DM 중복 방지 저장소(`ig_comment_dm`, 0058). 서비스 롤 전용 테이블이다.
 * comment_id가 기본키라 같은 댓글을 두 번 선점하면 unique 위반으로 막힌다.
 */
export function createDmStore(): Pick<HandleDeps, "claim" | "markResult"> {
  if (!hasSupabase) {
    return {
      async claim(event) {
        if (memoryClaims.has(event.commentId)) return false;
        memoryClaims.add(event.commentId);
        return true;
      },
      async markResult() {},
    };
  }

  return {
    async claim(event, rule) {
      const db = createServiceClient();
      const { error } = await db.from("ig_comment_dm").insert({
        comment_id: event.commentId,
        media_id: event.mediaId ?? null,
        from_id: event.fromId ?? null,
        from_username: event.fromUsername ?? null,
        rule_id: rule.id,
        status: "claimed",
      });
      // PostgREST는 throw하지 않는다 — error를 직접 본다.
      if (!error) return true;
      if (error.code === "23505") return false; // 이미 선점된 댓글(웹훅 재전송)
      throw new Error(`ig_comment_dm claim 실패: ${error.message}`);
    },
    async markResult(commentId, status, errorText) {
      const db = createServiceClient();
      const { error } = await db
        .from("ig_comment_dm")
        .update({
          status,
          error: errorText ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("comment_id", commentId);
      // 기록 실패는 발송 결과를 바꾸지 않는다 — 텔레메트리처럼 남기고 넘어간다.
      if (error) {
        console.error(`[ig-dm] markResult 실패 ${commentId}: ${error.message}`);
      }
    },
  };
}
