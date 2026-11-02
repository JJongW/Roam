/**
 * 부스의 **확인된 주소**를 네이버 지역 검색으로 채운다. 모델을 부르지 않는다.
 *
 * 왜 지역 검색만 쓰나: 웹문서 검색으로 법인명을 치면 사업자등록 조회·기업정보
 * 디렉터리가 나온다(bizno·marketbz·thevc·webify…). 거기엔 모든 회사 이름이 다
 * 적혀 있어서 "페이지에 이름이 있나"로는 안 걸러진다 — 1차 시도가 그래서 13%였다.
 *
 * 지역 검색은 **상호**를 돌려준다. 상호가 부스명과 일치하는지로 가를 수 있고,
 * 업종(category)까지 와서 한 번 더 맞대볼 수 있다.
 *
 * **재현율보다 정밀도다.** 틀린 주소를 넣으면 게이트가 그걸 "확인된 주소"로 믿어
 * 자동 승인이 거짓 앵커 위를 통과한다 — 주소가 없는 것보다 나쁘다. 그래서 애매하면
 * 버린다.
 *
 *   npx vite-node -c worker/vite.config.ts scripts/resolve-booth-links.ts <slug|all> [--apply] [--limit N]
 */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";

const arg = (k: string) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const slugArg = process.argv[2];
const apply = process.argv.includes("--apply");
const limit = Number(arg("--limit") ?? 0) || Infinity;

/** 남의 집 — 여기 걸린 주소는 이 부스의 것이 아니다. */
const NOT_OWN = /(^|\.)(lotteon|11st|gmarket|auction|coupang|ssg|interpark|tmon|smartstore\.naver|shopping\.naver|brand\.naver|blog\.naver|cafe\.naver|post\.naver|m\.blog|tistory|facebook|youtube|instagram|tiktok|alibaba|amazon|ebay|etsy|jobkorea|saramin|wanted|catch|bizno|marketbz|thevc|nicebizinfo|kompass|webify|place\.map\.naver|map\.naver|naver\.me|bit\.ly|pf\.kakao|talk\.naver|open\.kakao|linktr\.ee|litt\.ly)\./i;

/** 법인 수식어와 공백은 신원이 아니다 — "㈜아로마상사"와 "아로마상사"는 같다. */
function key(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/\((주|유|재|사)\)|㈜|㈐|주식회사|유한회사|합자회사|농업회사법인/g, "")
    .replace(/[\s .,·\-_'"()[\]]/g, "")
    .toLowerCase();
}

async function local(query: string) {
  const id = process.env.NCP_APIGW_API_KEY_ID, k = process.env.NCP_APIGW_API_KEY;
  if (!id || !k) throw new Error("NCP_APIGW_API_KEY_ID / NCP_APIGW_API_KEY 가 없다");
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/local?query=${encodeURIComponent(query)}&display=5&format=json`;
  const res = await fetch(url, {
    headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": k },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 429) throw new Error("쿼터 초과(429) — 멈춘다");
  if (!res.ok) return [];
  const body = (await res.json()) as {
    items?: { title: string; link: string; category?: string; address?: string }[];
  };
  return body.items ?? [];
}

/** 그 사이트가 정말 이 부스 것인가 — **지역 검색과 독립인 두 번째 검증.**
 *  상호가 같아도 등록된 링크가 엉뚱할 수 있다(㈜토스코하이본 → cheethashow.com).
 *  자기 집이면 이름이 제목이나 도메인에 남는다: 미건씨스템→"미건시스템",
 *  키쿠보→kikubo.co.kr, 손스마켓메이커즈→"손스마켓", 칼디커피랩→"칼디커피로스터". */
async function ownsSite(url: string, name: string): Promise<string | null> {
  let html: string;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(12_000),
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36",
        "accept-language": "ko-KR,ko;q=0.9",
      },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // 국내 구형 사이트는 EUC-KR 이 많다. 깨진 채로 비교하면 전부 탈락한다.
    const raw = buf.toString("utf8");
    html = /charset=["']?(euc-kr|ks_c_5601|cp949)/i.test(raw.slice(0, 2000))
      ? new TextDecoder("euc-kr").decode(buf)
      : raw;
  } catch {
    return null;
  }
  const title = (html.match(/<title[^>]*>([\s\S]{0,200}?)<\/title>/i)?.[1] ?? "").trim();
  const where = key(`${title} ${url}`);
  const want = key(name);
  // 전체 이름, 또는 **앞 두 글자**(법인 수식어를 뺀 뒤의 머리). 상호 일치를 이미
  // 통과한 뒤라 두 번째 잣대는 느슨해도 된다 — 둘 다 우연히 맞긴 어렵다.
  if (where.includes(want) || (want.length >= 2 && where.includes(want.slice(0, 2)))) {
    return title.replace(/\s+/g, " ").slice(0, 60);
  }
  return null;
}

const repo = await getRepository();
const { data: exhibitions } = await repo.listExhibitions({ limit: 200 });
const targets = slugArg === "all" ? exhibitions : exhibitions.filter((e) => e.slug === slugArg);
if (!targets.length) throw new Error(`전시를 찾을 수 없다: ${slugArg}`);

const picks: { code: string; name: string; websiteUrl: string; title: string; category: string }[] = [];
let hit = 0, seen = 0, wrote = 0;
for (const e of targets) {
  const booths = (await repo.listBoothsFull(e.id)).filter(
    (b) => b.kind !== "facility" && !b.websiteUrl && !b.instagramUrl,
  );
  console.log(`\n${e.slug}: 주소 없는 부스 ${booths.length}건${apply ? "" : " (미리보기)"}`);
  for (const b of booths.slice(0, limit)) {
    seen += 1;
    const want = key(b.name);
    const found = (await local(b.name)).find(
      (it) => it.link && key(it.title) === want && !NOT_OWN.test(`${new URL(it.link).hostname}.`),
    );
    if (!found) { console.log(`  · ${(b.code ?? "").padEnd(6)} ${b.name}`); continue; }
    const title = await ownsSite(found.link, b.name);
    if (!title) { console.log(`  ? ${(b.code ?? "").padEnd(6)} ${b.name} → ${found.link} — 상호는 같은데 사이트가 자기 집이 아니다`); continue; }
    hit += 1;
    console.log(`  ✓ ${(b.code ?? "").padEnd(6)} ${b.name} → ${found.link}  "${title}"  [${found.category ?? ""}]`);
    picks.push({ code: b.code ?? "", name: b.name, websiteUrl: found.link, title, category: found.category ?? "" });
    if (apply) { await repo.updateBooth(b.id, { websiteUrl: found.link }); wrote += 1; }
  }
}
console.log(`\n두 검증 통과 ${hit} / ${seen} (${Math.round(hit / Math.max(seen, 1) * 100)}%)${apply ? ` · 저장 ${wrote}` : ""}`);

// **바로 쓰지 않는다.** 틀린 주소는 없는 것보다 나쁘다 — 초안기가 그걸 "공식
// 주소(확인됨)"로 모델에 먹이기 때문에, 틀리면 모델이 다른 회사 얘기를 자신 있게
// 쓰고 그 사이트가 출처로 잡혀 unanchored 도 안 뜬다. 그래서 사람이 한 번 보는
// 인입 파일로 떨군다 — /admin/intake 가 미리보기에서 "빈 칸만 채운다"로 적용한다.
if (!apply && picks.length && slugArg !== "all") {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  mkdirSync("data/intake", { recursive: true });
  const json = `data/intake/${slugArg}-links.json`;
  writeFileSync(json, JSON.stringify({ version: 1, exhibitionSlug: slugArg,
    booths: picks.map((p) => ({ code: p.code, websiteUrl: p.websiteUrl })) }, null, 2) + "\n");
  const md = `data/intake/${slugArg}-links.md`;
  writeFileSync(md, `# ${slugArg} 공식 주소 후보 ${picks.length}건\n\n` +
    `지역 검색 상호 일치 + 사이트 제목/도메인 일치, **둘 다** 통과한 것만.\n` +
    `아닌 줄이 보이면 \`${json}\`에서 그 code 를 지우고 /admin/intake 에 올린다.\n\n` +
    `| 부스 | 이름 | 사이트 | 제목 | 업종 |\n|---|---|---|---|---|\n` +
    picks.map((p) => `| ${p.code} | ${p.name} | ${p.websiteUrl} | ${p.title} | ${p.category} |`).join("\n") + "\n");
  console.log(`\n${json}\n${md}  ← 사람이 훑고 /admin/intake 에 올린다`);
}
