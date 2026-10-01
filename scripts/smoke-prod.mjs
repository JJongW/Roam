// 운영 스모크 — 실제 운영 DB에 쓰고, 다시 읽고, 지운다.
//
//   node scripts/smoke-prod.mjs [base]        (기본 https://roam.ai.kr)
//
// 왜 mock E2E가 아니라 이건가: 2026-07-27 감사의 P0 두 건(북마크·커뮤니티 전량
// 유실)과 2026-10-01 인입 별칭 유실은 전부 **Supabase에서만** 났다 — mock은
// 입력을 그대로 들고 있어서 통과한다. 쓰기가 실제로 남는지는 운영 DB로만 안다.
//
// 흔적을 남기지 않는다: 매번 새 테스트 계정(smoke…)을 만들고, 끝나면(실패해도)
// 그 계정과 쓴 글을 서비스 롤로 지운다. 글은 끝난 전시(SIBF, 6월)에 써서 방문객
// 눈에 띌 일이 없다. 운영 자격증명(.env)이 있는 기기에서만 돈다.
import "dotenv/config";

const BASE = (process.argv[2] ?? "https://roam.ai.kr").replace(/\/+$/, "");
const SLUG = "sibf-2026";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) {
  console.error("운영 자격증명(.env)이 없다 — 정리를 못 하므로 시작하지 않는다");
  process.exit(2);
}

const jar = new Map();
async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const i = kv.indexOf("=");
    jar.set(kv.slice(0, i), kv.slice(i + 1));
  }
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 본문 없음(204) */ }
  return { status: res.status, json, text };
}
const sb = (path, init = {}) =>
  fetch(`${SB}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, ...init.headers } });

let failed = 0;
function check(name, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${detail}`}`);
  if (!cond) failed++;
  return cond;
}

const nickname = `smoke${Date.now().toString(36)}`;
let userId = null;
let postId = null;
try {
  // ── 로그인 ──────────────────────────────────────────────────────────
  const login = await call("POST", "/api/auth/login", { nickname });
  userId = login.json?.data?.user?.id ?? null;
  if (!check("닉네임 로그인", login.status === 201 && userId, login.text.slice(0, 200))) throw new Error("로그인 실패");

  // ── 북마크: 쓰기 → 다시 읽기 → 지우기 → 다시 읽기 ───────────────────
  const booths = await call("GET", `/api/exhibitions/${SLUG}/booths?limit=1`);
  const boothId = booths.json?.data?.data?.[0]?.id ?? booths.json?.data?.items?.[0]?.id;
  check("부스 하나 고르기", Boolean(boothId), booths.text.slice(0, 200));
  if (boothId) {
    const target = { targetType: "booth", targetId: boothId };
    const add = await call("POST", "/api/bookmarks", target);
    check("북마크 쓰기", add.status === 201, add.text.slice(0, 200));
    const list1 = await call("GET", "/api/bookmarks");
    check("북마크가 다시 읽힌다", list1.text.includes(boothId), list1.text.slice(0, 200));
    const del = await call("DELETE", "/api/bookmarks", target);
    check("북마크 지우기", del.status === 204, del.text.slice(0, 200));
    const list2 = await call("GET", "/api/bookmarks");
    check("지운 북마크가 안 읽힌다", list2.status === 200 && !list2.text.includes(boothId), list2.text.slice(0, 200));
  }

  // ── 커뮤니티: 쓰기 → 다시 읽기 → 지우기 → 다시 읽기 ─────────────────
  const marker = `[운영 점검 ${nickname}] 곧 지워집니다`;
  const post = await call("POST", `/api/exhibitions/${SLUG}/community`, { body: marker, authorName: nickname });
  postId = post.json?.data?.post?.id ?? null;
  check("커뮤니티 글 쓰기", post.status === 201 && postId, post.text.slice(0, 200));
  const feed1 = await call("GET", `/api/exhibitions/${SLUG}/community`);
  check("글이 다시 읽힌다", feed1.text.includes(marker), feed1.text.slice(0, 200));
  if (postId) {
    const del = await call("DELETE", `/api/community/${postId}`);
    check("글 지우기(본인)", del.status === 204, del.text.slice(0, 200));
    const feed2 = await call("GET", `/api/exhibitions/${SLUG}/community`);
    check("지운 글이 안 읽힌다", !feed2.text.includes(marker));
  }
} catch (e) {
  console.log(`✗ 중단: ${e.message}`);
  failed++;
} finally {
  // 실패해도 흔적을 지운다. 지우기 자체가 실패하면 그것도 실패로 센다.
  if (postId) await sb(`community_post?id=eq.${postId}`, { method: "DELETE" });
  // 글을 쓰면 익명 세션(roam_session)도 하나 생긴다 — 그것도 지운다.
  const sess = jar.get("roam_session");
  if (sess) {
    const r = await sb(`visitor_session?id=eq.${encodeURIComponent(sess)}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    check("테스트 세션 정리", r.ok, `HTTP ${r.status} ${(await r.text()).slice(0, 120)}`);
  }
  if (userId) {
    const r = await sb(`app_user?id=eq.${userId}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    const gone = r.ok && (await r.json()).length === 1;
    check("테스트 계정 정리", gone, `HTTP ${r.status}`);
  }
}
console.log(failed ? `\n실패 ${failed}건` : "\n전부 통과");
process.exit(failed ? 1 : 0);
