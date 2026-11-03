// 브랜드 자체 사이트를 예의 있게 읽는다(2026-11-03 Ted 결정: 사이트 읽기는 켜고 시작).
// - 인스타그램과 판매 페이지는 계속 읽지 않는다(mayFetch, draft.ts).
// - robots.txt를 지킨다. 우리 이름(RoamBot) 그룹이 있으면 그걸, 없으면 * 그룹을 본다.
// - 같은 호스트에는 요청 사이에 간격을 둔다. 요청마다 타임아웃.
// - User-Agent에 우리가 누구인지와 연락처를 밝힌다.
// fetch, 시계, 대기는 주입받는다 — 테스트가 네트워크 없이 돈다.

export const ROAM_BOT_NAME = "RoamBot";
export const ROAM_BOT_UA = `${ROAM_BOT_NAME}/1.0 (+Roam brand profile drafter; contact: instagram.com/withromi.con)`;

export interface RobotsRules {
  allow: string[];
  disallow: string[];
}

/** robots.txt에서 우리에게 해당하는 규칙. 우리 이름 그룹이 있으면 그것만, 없으면 * 그룹. */
export function parseRobots(txt: string, botName = ROAM_BOT_NAME): RobotsRules {
  type Group = { agents: string[]; allow: string[]; disallow: string[] };
  const groups: Group[] = [];
  let cur: Group | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).trim().toLowerCase();
    const val = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) {
        cur = { agents: [], allow: [], disallow: [] };
        groups.push(cur);
      }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if (key === "allow" && val) cur.allow.push(val);
    if (key === "disallow" && val) cur.disallow.push(val);
  }
  const me = botName.toLowerCase();
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && me.includes(a)));
  const pick = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  return { allow: pick.flatMap((g) => g.allow), disallow: pick.flatMap((g) => g.disallow) };
}

function ruleMatch(rule: string, path: string): number {
  // * 와 끝의 $ 정도만 지원한다(대부분의 robots.txt가 이 범위다).
  const anchored = rule.endsWith("$");
  const body = (anchored ? rule.slice(0, -1) : rule).split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  const re = new RegExp(`^${body}${anchored ? "$" : ""}`);
  return re.test(path) ? rule.length : -1;
}

/** 가장 길게 맞는 규칙이 이긴다. 같으면 allow. 규칙이 없으면 허용. */
export function robotsAllows(rules: RobotsRules, path: string): boolean {
  let best = -1;
  let allowed = true;
  for (const r of rules.disallow) {
    const n = ruleMatch(r, path);
    if (n > best) {
      best = n;
      allowed = false;
    }
  }
  for (const r of rules.allow) {
    const n = ruleMatch(r, path);
    if (n >= best && n >= 0) {
      best = n;
      allowed = true;
    }
  }
  return allowed;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PoliteFetchOptions {
  fetchImpl?: typeof fetch;
  /** 같은 호스트 요청 사이 최소 간격. */
  minIntervalMs?: number;
  timeoutMs?: number;
  userAgent?: string;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** 이 주소를 읽어도 되나(인스타, 판매 페이지 차단). */
  allowUrl?: (url: string) => boolean;
}

export function createPoliteFetcher(opts: PoliteFetchOptions = {}) {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const minInterval = opts.minIntervalMs ?? 2000;
  const timeout = opts.timeoutMs ?? 8000;
  const ua = opts.userAgent ?? ROAM_BOT_UA;
  const now = opts.now ?? (() => Date.now());
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const allowUrl = opts.allowUrl ?? (() => true);
  const lastAt = new Map<string, number>();
  const robots = new Map<string, RobotsRules | "blocked">();

  async function get(url: string): Promise<Response | null> {
    const host = new URL(url).host;
    const wait = (lastAt.get(host) ?? -Infinity) + minInterval - now();
    if (wait > 0) await sleep(wait);
    lastAt.set(host, now());
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      return await fetchImpl(url, { signal: ctl.signal, headers: { "user-agent": ua }, redirect: "follow" });
    } catch {
      return null;
    } finally {
      clearTimeout(t);
    }
  }

  async function rulesFor(origin: string): Promise<RobotsRules | "blocked"> {
    const cached = robots.get(origin);
    if (cached) return cached;
    const res = await get(`${origin}/robots.txt`);
    let rules: RobotsRules | "blocked";
    // 없으면(4xx) 허용, 서버 오류나 응답 없음이면 읽지 않는다(보수적으로).
    if (!res) rules = "blocked";
    else if (res.status >= 500) rules = "blocked";
    else if (!res.ok) rules = { allow: [], disallow: [] };
    else rules = parseRobots(await res.text());
    robots.set(origin, rules);
    return rules;
  }

  /** 페이지 본문 글자. 못 읽거나 막혀 있으면 null과 이유. */
  async function text(url: string): Promise<{ text: string | null; reason?: string }> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { text: null, reason: "주소가 아니에요" };
    }
    if (!allowUrl(url)) return { text: null, reason: "읽지 않는 곳이에요(인스타, 판매 페이지)" };
    const rules = await rulesFor(u.origin);
    if (rules === "blocked") return { text: null, reason: "robots.txt를 확인하지 못해 읽지 않았어요" };
    if (!robotsAllows(rules, u.pathname + u.search)) return { text: null, reason: "robots.txt가 막았어요" };
    const res = await get(url);
    if (!res || !res.ok) return { text: null, reason: `응답이 없거나 실패했어요(${res?.status ?? "없음"})` };
    if (!(res.headers.get("content-type") ?? "").includes("text/html")) return { text: null, reason: "HTML이 아니에요" };
    return { text: htmlToText((await res.text()).slice(0, 400_000)) };
  }

  return { text };
}
