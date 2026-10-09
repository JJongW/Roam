import { describe, expect, it } from "vitest";
import {
  collectBacklog,
  formatBacklog,
  SCAN_LIMIT,
  type Backlog,
} from "@/lib/admin/backlog";
import type { Repository } from "@/lib/repositories/types";

const NOW = Date.parse("2026-10-09T00:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

function repoWith(rows: {
  drafts?: { createdAt: string }[];
  brands?: { createdAt: string }[];
  queued?: { createdAt: string }[];
  failed?: { createdAt: string }[];
}): Repository {
  return {
    listEnrichmentCandidates: async () => rows.drafts ?? [],
    listExhibitorLinkCandidates: async () => rows.brands ?? [],
    listJobs: async (o?: { status?: string }) =>
      (o?.status === "failed" ? rows.failed : rows.queued) ?? [],
  } as unknown as Repository;
}

describe("collectBacklog", () => {
  it("기준일을 넘긴 것만 센다", async () => {
    const b = await collectBacklog(
      repoWith({ drafts: [{ createdAt: daysAgo(5) }, { createdAt: daysAgo(1) }] }),
      { staleDays: 3, now: NOW },
    );
    expect(b.drafts).toEqual({ count: 1, oldestDays: 5, atLeast: false });
    // 묵지 않은 것도 전체 대기 수에는 남는다.
    expect(b.pending.drafts).toBe(2);
  });

  it("잡은 하루 기준이다 — 기준일과 따로 센다", async () => {
    const b = await collectBacklog(repoWith({ queued: [{ createdAt: daysAgo(2) }] }), {
      staleDays: 7,
      now: NOW,
    });
    expect(b.stuckJobs.count).toBe(1);
  });
});

describe("formatBacklog", () => {
  const zero = { count: 0, oldestDays: 0, atLeast: false };
  const empty: Backlog = {
    staleDays: 3,
    drafts: zero,
    brands: zero,
    stuckJobs: zero,
    failedJobs: zero,
    pending: { drafts: 0, brands: 0, queued: 0 },
  };

  it("적체가 없으면 보내지 않는다", () => {
    expect(formatBacklog(empty)).toBeNull();
  });

  it("걸린 항목만 줄로 나온다", () => {
    const text = formatBacklog(
      { ...empty, drafts: { count: 4, oldestDays: 9, atLeast: false } },
      "https://roam.example/",
    );
    expect(text).toContain("검수 대기 초안 4건");
    expect(text).toContain("9일");
    expect(text).not.toContain("브랜드 신원");
    // 꼬리 슬래시가 겹치지 않는다.
    expect(text).toContain("<https://roam.example/admin/enrichment|");
    // 안 잘렸으면 "이상"을 붙이지 않는다.
    expect(text).not.toContain("이상");
  });

  it("조회 상한에 걸리면 숫자를 단정하지 않는다", () => {
    const text = formatBacklog({
      ...empty,
      drafts: { count: 1200, oldestDays: 7, atLeast: true },
    });
    expect(text).toContain("1200건 이상");
    expect(text).toContain("7일 이상");
  });
});

describe("조회 상한", () => {
  it("읽은 수가 상한과 같으면 더 있는 것으로 본다", async () => {
    const rows = Array.from({ length: SCAN_LIMIT.candidates }, () => ({
      createdAt: daysAgo(5),
    }));
    const b = await collectBacklog(repoWith({ drafts: rows }), {
      staleDays: 3,
      now: NOW,
    });
    expect(b.drafts.atLeast).toBe(true);
  });

  it("상한에 못 미치면 단정한다", async () => {
    const b = await collectBacklog(repoWith({ drafts: [{ createdAt: daysAgo(5) }] }), {
      staleDays: 3,
      now: NOW,
    });
    expect(b.drafts.atLeast).toBe(false);
  });
});
