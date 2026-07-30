import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// 트립와이어: 로미 영상은 두 포맷이 쌍으로 있어야 한다. WebKit(사파리·아이폰)은
// 투명 webm의 알파를 못 써서 RoamMotion이 같은 이름의 .mp4(alpha HEVC)로 바꿔
// 건다 — 새 webm만 추가하면 아이폰에서 그 자리가 조용히 정적 로미로 주저앉는다.
// 변환: ffmpeg -c:v libvpx-vp9 -i X.webm -c:v hevc_videotoolbox -alpha_quality 0.75 \
//        -pix_fmt yuva420p -tag:v hvc1 -allow_sw 1 -b:v 300k -an X.mp4
describe("로미 영상 자산", () => {
  const root = process.cwd();

  function webmRefs(dir: string, found = new Set<string>()): Set<string> {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) webmRefs(p, found);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) {
        for (const m of readFileSync(p, "utf8").matchAll(/"(\/[\w-]+\.webm)"/g))
          found.add(m[1]);
      }
    }
    return found;
  }

  const refs = [...webmRefs(join(root, "src"))];

  it("코드가 참조하는 webm이 최소 한 개는 있다", () => {
    expect(refs.length).toBeGreaterThan(0);
  });

  it.each(refs)("%s 은 webm·mp4 두 포맷이 다 있다", (ref) => {
    expect(existsSync(join(root, "public", ref))).toBe(true);
    expect(existsSync(join(root, "public", ref.replace(/\.webm$/, ".mp4")))).toBe(
      true,
    );
  });
});
