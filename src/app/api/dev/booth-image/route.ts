import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { fail, ok, parseBody } from "@/lib/api/http";

/**
 * **개발 전용 수집구.** 브라우저 페이지(인스타) 안에서 받은 이미지를 로컬에 쓴다.
 *
 * 왜 필요한가: 인스타 이미지 URL은 서명 토큰이 붙어 있어 밖으로 내보낼 수 없고
 * (확장이 막는다) 몇 시간이면 만료된다. 그래서 **페이지 안에서 내려받아 캔버스로
 * 줄인 뒤 여기로 바로 보낸다.** 토큰은 브라우저 밖으로 나오지 않는다.
 *
 * 운영에서는 존재하지 않는다 — NODE_ENV가 production이면 404다.
 */
const bodySchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{3,60}$/),
  code: z.string().regex(/^[A-Za-z0-9-]{1,20}$/),
  /** data:image/webp;base64,... */
  dataUrl: z.string().max(3_000_000),
});

const CORS = {
  "access-control-allow-origin": "https://www.instagram.com",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST,OPTIONS",
  // HTTPS 페이지에서 http://localhost로 보내려면 Chrome이 이 승인을 요구한다
  // (Private Network Access). 없으면 preflight에서 막힌다.
  "access-control-allow-private-network": "true",
};

export async function OPTIONS() {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;
  const { slug, code, dataUrl } = parsed.data;

  const m = dataUrl.match(/^data:image\/(webp|jpeg|png);base64,(.+)$/);
  if (!m) return fail("VALIDATION", "이미지 데이터가 아닙니다");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length < 1500) return fail("VALIDATION", "이미지가 너무 작습니다");

  const dir = join(process.cwd(), "public/booths", slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${code}.webp`), buf);
  return ok(
    { path: `/booths/${slug}/${code}.webp`, bytes: buf.length },
    { headers: CORS },
  );
}
