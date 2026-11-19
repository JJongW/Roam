// 관리자 화면 중 어느 화면에 박람회 선택기가 뜨는지 고정한다(2026-11-19 Ted: 홈에 선택기가 떠 있음).
// 선택기는 레이아웃이 아니라 박람회 하나를 보는 화면의 머리 줄(AdminFairHeader)에만 있다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

const ADMIN_DIR = join(process.cwd(), "src/app/admin");

function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return pages(p);
    return name === "page.tsx" ? [p] : [];
  });
}

/** 파일 경로 → 라우트("/admin/booths"). */
function route(file: string): string {
  const rel = relative(ADMIN_DIR, file).replace(/\/?page\.tsx$/, "");
  return rel ? `/admin/${rel}` : "/admin";
}

const sources = new Map(pages(ADMIN_DIR).map((f) => [route(f), readFileSync(f, "utf8")]));

/** 박람회 하나를 보는 화면. 이 목록만 제목 옆에 선택기를 그린다. */
const FAIR_SCOPED = [
  "/admin/analytics",
  "/admin/booths",
  "/admin/enrichment",
  "/admin/errors",
  "/admin/events",
  "/admin/timeline",
  "/admin/verify",
].sort();

describe("관리자 박람회 선택기 범위", () => {
  it("선택기는 박람회 하나를 보는 화면에만 뜬다", () => {
    const withSwitcher = [...sources]
      .filter(([, src]) => src.includes("<AdminFairHeader"))
      .map(([r]) => r)
      .sort();
    expect(withSwitcher).toEqual(FAIR_SCOPED);
  });

  it("홈과 전체 화면에는 선택기가 없다", () => {
    for (const r of ["/admin", "/admin/brands", "/admin/accounts", "/admin/design-system", "/admin/exhibitions"]) {
      const src = sources.get(r);
      expect(src, r).toBeDefined();
      expect(src, r).not.toContain("AdminFairHeader");
      expect(src, r).not.toContain("ExhibitionSwitcher");
    }
  });

  it("레이아웃은 선택기를 그리지 않는다", () => {
    const layout = readFileSync(join(ADMIN_DIR, "layout.tsx"), "utf8");
    expect(layout).not.toContain("ExhibitionSwitcher");
    expect(layout).not.toContain("resolveAdminExhibition");
  });

  it("고른 박람회를 읽는 화면은 반드시 선택기를 그린다", () => {
    for (const [r, src] of sources) {
      // 브랜드 연락 현황은 ?fair=와 자체 선택 상자가 있다.
      if (r === "/admin/brands/contacts") continue;
      const readsScope =
        src.includes("getAdminFairScope") ||
        src.includes("ADMIN_EXHIBITION_COOKIE") ||
        src.includes("resolveAdminExhibition");
      expect(readsScope, r).toBe(FAIR_SCOPED.includes(r));
    }
  });
});
