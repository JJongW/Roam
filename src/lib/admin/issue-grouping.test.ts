import { describe, expect, it } from "vitest";
import { componentOf, groupIssues } from "./issue-grouping";
import type { IssueLog } from "@/lib/types";

function issue(overrides: Partial<IssueLog> & { message: string }): IssueLog {
  return {
    id: `i_${Math.random()}`,
    source: "server",
    createdAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("componentOf", () => {
  it("/admin, /api/admin → 관리자", () => {
    expect(componentOf("/admin/errors")).toBe("관리자");
    expect(componentOf("/api/admin/users")).toBe("관리자");
  });

  it("/login, /auth, /api/auth → 로그인", () => {
    expect(componentOf("/login")).toBe("로그인");
    expect(componentOf("/auth/callback")).toBe("로그인");
    expect(componentOf("/api/auth/me")).toBe("로그인");
  });

  it("/exhibitions/[slug]/map → 지도(피드/전시홈보다 우선)", () => {
    expect(componentOf("/exhibitions/sibf-2026/map")).toBe("지도");
  });

  it("/booths, /api/booths → 부스 상세", () => {
    expect(componentOf("/booths/A01")).toBe("부스 상세");
    expect(componentOf("/api/booths/A01")).toBe("부스 상세");
  });

  it("/exhibitions(map 제외), /api/exhibitions → 피드/전시홈", () => {
    expect(componentOf("/exhibitions/sibf-2026")).toBe("피드/전시홈");
    expect(componentOf("/api/exhibitions/sibf-2026")).toBe("피드/전시홈");
  });

  it("/api/me/* → 컴패니언", () => {
    expect(componentOf("/api/me/reflect")).toBe("컴패니언");
    expect(componentOf("/api/me/values")).toBe("컴패니언");
  });

  it("/api/ai, /api/community, /api/cloudinary → AI/미디어", () => {
    expect(componentOf("/api/ai/booth-summary")).toBe("AI/미디어");
    expect(componentOf("/api/community/xyz")).toBe("AI/미디어");
    expect(componentOf("/api/cloudinary/sign")).toBe("AI/미디어");
  });

  it("모르는 경로 → 기타", () => {
    expect(componentOf("/push/subscribe")).toBe("기타");
  });

  it("path 없음 → 기타", () => {
    expect(componentOf(undefined)).toBe("기타");
  });
});

describe("groupIssues", () => {
  it("같은 (path, message)를 묶어 횟수를 센다", () => {
    const issues = [
      issue({
        message: "boom",
        path: "/api/me/reflect",
        createdAt: "2026-08-12T00:00:00Z",
      }),
      issue({
        message: "boom",
        path: "/api/me/reflect",
        createdAt: "2026-08-12T01:00:00Z",
      }),
      issue({
        message: "boom",
        path: "/api/me/reflect",
        createdAt: "2026-08-12T02:00:00Z",
      }),
    ];
    const groups = groupIssues(issues);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].firstSeenAt).toBe("2026-08-12T00:00:00Z");
    expect(groups[0].lastSeenAt).toBe("2026-08-12T02:00:00Z");
    expect(groups[0].sample.createdAt).toBe("2026-08-12T02:00:00Z"); // 최신 샘플
  });

  it("path나 message가 다르면 따로 묶는다", () => {
    const issues = [
      issue({ message: "boom", path: "/api/me/reflect" }),
      issue({ message: "boom", path: "/api/me/values" }),
      issue({ message: "kaboom", path: "/api/me/reflect" }),
    ];
    expect(groupIssues(issues)).toHaveLength(3);
  });

  it("component가 path 규칙으로 붙는다", () => {
    const groups = groupIssues([
      issue({ message: "x", path: "/admin/errors" }),
    ]);
    expect(groups[0].component).toBe("관리자");
  });

  it("lastSeenAt 내림차순으로 정렬된다", () => {
    const issues = [
      issue({ message: "old", path: "/a", createdAt: "2026-08-10T00:00:00Z" }),
      issue({ message: "new", path: "/b", createdAt: "2026-08-12T00:00:00Z" }),
    ];
    const groups = groupIssues(issues);
    expect(groups[0].message).toBe("new");
    expect(groups[1].message).toBe("old");
  });

  it("빈 배열이면 빈 배열", () => {
    expect(groupIssues([])).toEqual([]);
  });
});
