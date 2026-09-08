// 인스타 참가 확정 수집기 — **브라우저 페이지 컨텍스트에서** 돈다.
//
//   크롬 확장으로 instagram.com 탭을 열고 이 파일 내용을 주입해 실행한다.
//   (node로는 못 돈다 — 로그인 세션 쿠키가 있어야 인스타가 응답한다.)
//
// 왜 이렇게 하나: 초안기의 googleSearch 근거는 브랜드를 자주 헷갈린다(미국
// 에어프라이어 "Aria"를 부스 '아리아'로 씀). 반면 **브랜드 본인이 "마곡리빙마켓에
// 참여합니다"라고 쓴 게시물**은 참여 여부가 100% 확정이고 내용도 본인 발화다.
//
// 입력  window.__TARGETS = [[code, name], ...]
// 출력  window.__RESULT   = { code: {...} }
(async () => {
  const APP_ID = "936619743392459";
  const KEY = /마곡리빙마켓|마곡리빙|마곡 리빙|magok living/i;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (s) => (s || "").replace(/[\s().·\-_]/g, "").toLowerCase();

  async function j(url, extra) {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "x-ig-app-id": APP_ID, ...(extra || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /** 이름으로 계정 후보를 찾는다. 인스타 자체 검색이라 한글이 잘 먹는다. */
  async function search(q) {
    const d = await j(
      `https://www.instagram.com/web/search/topsearch/?context=blended&query=${encodeURIComponent(q)}`,
    );
    return (d.users || []).map((u) => u.user).filter(Boolean);
  }

  /** 프로필 + 최근 게시물 캡션. */
  async function profile(username) {
    const d = await j(
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
    );
    const u = d?.data?.user;
    if (!u) return null;
    const posts = (u.edge_owner_to_timeline_media?.edges || []).map(
      (e) => e.node?.edge_media_to_caption?.edges?.[0]?.node?.text || "",
    );
    return {
      username: u.username,
      full: u.full_name || "",
      bio: u.biography || "",
      link: u.external_url || "",
      followers: u.edge_followed_by?.count ?? 0,
      posts,
    };
  }

  const out = {};
  const targets = window.__TARGETS || [];
  let i = 0;
  const CONC = 3; // 인스타가 429를 잘 던진다 — 낮게 유지한다
  async function worker() {
    while (i < targets.length) {
      const [code, name] = targets[i++];
      try {
        const users = await search(name);
        // 이름이 그대로 들어간 계정을 우선한다. 없으면 팔로워 최다.
        const n = norm(name);
        const scored = users
          .map((u) => ({
            u,
            hit:
              norm(u.full_name).includes(n) || n.includes(norm(u.full_name)) ? 2 : 0,
          }))
          .sort((a, b) => b.hit - a.hit || (b.u.follower_count ?? 0) - (a.u.follower_count ?? 0));
        const pick = scored[0]?.u;
        if (!pick) { out[code] = { name, found: false }; continue; }
        const p = await profile(pick.username);
        if (!p) { out[code] = { name, found: false }; continue; }
        const hitBio = KEY.test(p.bio);
        const hitPost = p.posts.find((t) => KEY.test(t));
        out[code] = {
          name,
          found: true,
          username: p.username,
          full: p.full,
          bio: p.bio.slice(0, 300),
          link: p.link,
          followers: p.followers,
          // 본인이 마곡리빙마켓을 언급했으면 참여 확정이다.
          confirmed: Boolean(hitBio || hitPost),
          evidence: (hitPost || (hitBio ? p.bio : "")).replace(/\s+/g, " ").slice(0, 400),
          candidates: scored.slice(0, 3).map((s) => `${s.u.username}(${s.u.full_name})`),
        };
      } catch (e) {
        out[code] = { name, found: false, error: String(e).slice(0, 80) };
      }
      await sleep(700 + Math.random() * 500);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  window.__RESULT = out;
  return {
    처리: Object.keys(out).length,
    확정: Object.values(out).filter((r) => r.confirmed).length,
    못찾음: Object.values(out).filter((r) => !r.found).length,
  };
})()
