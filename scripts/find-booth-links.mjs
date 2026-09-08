// 인입 파일의 부스에 공식 인스타 링크를 채운다. 전시 무관 — intake.v1 계약 위에서 돈다.
//
//   node scripts/find-booth-links.mjs data/intake/<slug>.json [--limit N] [--dry]
//
// 인스타 자동 스크래핑은 금지다(docs/booth-enrichment.md). 그래서 인스타를 긁지
// 않는다 — **브랜드 공식 사이트를 읽어 브랜드가 스스로 건 링크**를 가져온다.
// 사이트를 모르면 구글 검색 근거로 공식 사이트부터 찾는다(그 단계에만 LLM).
//
// 모델에게 핸들을 물어보는 방식은 버렸다. 8건을 시험했더니 전부 "_official"을
// 붙인 그럴듯한 환각이었고 근거에 인스타가 한 건도 안 잡혔다.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { GoogleGenAI } from "@google/genai";

const [file, ...rest] = process.argv.slice(2);
if (!file) { console.error("사용법: node scripts/find-booth-links.mjs <인입파일> [--limit N] [--dry]"); process.exit(1); }
const DRY = rest.includes("--dry");
const LIMIT = Number(rest[rest.indexOf("--limit") + 1]) || Infinity;
const CONCURRENCY = 6;

const key = process.env.GEMINI_API_KEY
  ?? (readFileSync(".env", "utf8").match(/^GEMINI_API_KEY=(.+)$/m)?.[1] ?? "").trim();
const ai = key ? new GoogleGenAI({ apiKey: key }) : null;
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 인스타 주소로 쓰이지 않는 경로들 — 이걸 계정으로 착각하면 남의 페이지를 건다.
const RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "tv", "accounts",
  "about", "developer", "legal", "directory", "web", "share", "invites", "challenge"]);
// href로 실제로 걸린 링크만 본다. 본문에 스쳐 지나간 언급까지 세면 협력사·
// 제작사 계정을 브랜드 계정으로 착각한다.
const HREF = /(?:href|content)\s*=\s*["'][^"']*instagram\.com\/(?:#!\/)?@?([A-Za-z0-9._]{2,30})/gi;
const ANY  = /instagram\.com\/(?:#!\/)?@?([A-Za-z0-9._]{2,30})/gi;

const toks = (s) => (s ?? "").toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3);

/** 도메인·브랜드명과 겹치는 핸들을 우선한다. 겹치는 게 없으면 골라두되 약함으로 표시. */
function pickHandle(html, site, name) {
  const count = new Map();
  const add = (re, w) => {
    for (const m of html.matchAll(re)) {
      const h = m[1];
      if (RESERVED.has(h.toLowerCase()) || /^\d+$/.test(h)) continue;
      count.set(h, (count.get(h) ?? 0) + w);
    }
  };
  add(HREF, 10);
  add(ANY, 1);
  if (!count.size) return null;
  const host = (() => { try { return new URL(site).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const want = new Set([...toks(host.split(".")[0]), ...toks(name)]);
  const score = (h) => {
    const t = toks(h);
    const hit = t.some((x) => want.has(x)) ||
      [...want].some((w) => h.toLowerCase().replace(/[._]/g, "").includes(w));
    return (hit ? 1000 : 0) + count.get(h);
  };
  const best = [...count.keys()].sort((a, b) => score(b) - score(a))[0];
  return { handle: best, weak: score(best) < 1000 };
}

async function fetchText(url) {
  const c = AbortSignal.timeout(12000);
  const res = await fetch(url, { signal: c, redirect: "follow", headers: {
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    "accept-language": "ko,en;q=0.8",
  } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

// 전시 디렉터리·언론·플랫폼은 브랜드 사이트가 아니다. 근거에 늘 섞여 들어온다.
// fair/expo도 넣는다 — 다른 박람회 참가사 목록에 이름이 있으면 이름 확인을
// 통과해버린다(cafenbakeryfair.com을 썬양의자연주의 사이트로 오인했다).
const AGGREGATOR = /(magoklivingdesignfair|micehub|heypop|slist|nsenior|dhns|designfestival|tripmate|naver|kakao|daum|tistory|instagram|facebook|youtube|google|wikipedia|namu\.wiki|news|yna\.co\.kr|inews|newsis|fair|expo|festa|11st|coupang|gmarket|auction|wadiz|ohou\.se|idus)/i;

/** 검색 근거에 잡힌 도메인 후보. 모델이 말한 주소가 아니라 **검색이 실제로 물어온
 *  도메인**만 쓴다 — 지어낸 주소를 원천 차단한다. */
async function siteCandidates(name, context) {
  if (!ai) return [];
  // "JSON만 출력"을 붙이면 모델이 검색을 건너뛰고 기억으로 답한다(근거 0건으로 확인).
  // 그래서 자연문으로 묻고, 답이 아니라 근거를 읽는다.
  const q = `"${name}" 브랜드의 공식 홈페이지와 인스타그램 계정이 어디야?${context ? ` ${context}` : ""}`;
  for (const model of MODELS) {
    try {
      const res = await ai.models.generateContent({ model, contents: q,
        config: { temperature: 0.1, tools: [{ googleSearch: {} }], thinkingConfig: { thinkingBudget: 0 } } });
      const titles = (res.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
        .map((c) => c.web?.title ?? "").filter((t) => /^[\w.-]+\.[a-z]{2,}$/i.test(t));
      const rank = new Map();
      for (const t of titles) {
        if (AGGREGATOR.test(t)) continue;
        rank.set(t, (rank.get(t) ?? 0) + 1);
      }
      return [...rank.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([d]) => `https://${d}`);
    } catch { await sleep(700); }
  }
  return [];
}

const doc = JSON.parse(readFileSync(file, "utf8"));
const context = `${doc.exhibitionSlug.replace(/-\d+$/, "").replace(/-/g, " ")} 참가 브랜드야.`;
const targets = doc.booths.filter((b) => b.kind !== "facility" && !b.instagramUrl).slice(0, LIMIT);
console.log(`${doc.exhibitionSlug} · 대상 ${targets.length} / 전체 ${doc.booths.length}`);

const review = [];
const stat = { found: 0, weak: 0, noSite: 0, noLink: 0, err: 0, searched: 0 };
async function one(b) {
  let site = b.websiteUrl, html = null;
  if (site) {
    try { html = await fetchText(site); }
    catch (e) { stat.err++; console.log(`  ! ${b.code} ${b.name} ${site} — ${e.message}`); return; }
  } else {
    // 후보 사이트를 열어 **브랜드 이름이 실제로 그 페이지에 있는지** 확인한 것만 쓴다.
    for (const cand of await siteCandidates(b.name, context)) {
      let h;
      try { h = await fetchText(cand); } catch { continue; }
      const flat = h.replace(/\s+/g, "");
      if (!flat.includes(b.name.replace(/\s+/g, ""))) continue;
      site = cand; html = h; b.websiteUrl = cand; stat.searched++;
      break;
    }
    if (!html) { stat.noSite++; return; }
  }
  const r = pickHandle(html, site, b.name);
  if (!r) { stat.noLink++; return; }
  b.instagramUrl = `https://www.instagram.com/${r.handle}`;
  // 도메인·브랜드명과 안 겹치는 핸들은 사람이 봐야 한다 — 협력사 계정일 수 있다.
  if (r.weak) { review.push({ code: b.code, name: b.name, site, instagramUrl: b.instagramUrl,
      why: "도메인·브랜드명과 안 겹침 — 협력사/제작사 계정일 수 있다" }); stat.weak++; }
  stat.found++;
  console.log(`  ${r.weak ? "?" : "✓"} ${b.code} ${b.name} → @${r.handle}${r.weak ? "  (확인 필요)" : ""}`);
}
for (let i = 0; i < targets.length; i += CONCURRENCY)
  await Promise.all(targets.slice(i, i + CONCURRENCY).map(one));

console.log(`\n찾음 ${stat.found}(확인필요 ${stat.weak}) · 사이트에 링크 없음 ${stat.noLink} · 사이트 모름 ${stat.noSite} · 접속실패 ${stat.err} · 검색으로 사이트 찾음 ${stat.searched}`);
if (!DRY) {
  writeFileSync(file, JSON.stringify(doc, null, 1));
  console.log("파일 갱신:", file);
  // 계약 파일엔 계약에 있는 것만 남긴다. 확인이 필요한 건 옆 파일로 뺀다.
  // 계약 파일과 같은 폴더에 두면 인입 파일로 오인된다(_backup과 같은 관례).
  const rf = file.replace(/([^/]+)\.json$/, "_review/$1.json");
  mkdirSync(dirname(rf), { recursive: true });
  writeFileSync(rf, JSON.stringify(review, null, 1));
  console.log("확인 목록:", rf, `(${review.length}건)`);
}
