// 앱 이벤트 개인정보 거름망(화면 설계서 E 2-1). 순수 함수.
//
// - 위치를 추적하지 않는다(11-11 결정, 처리방침 "정밀 위치정보 안 씀"). 좌표, 걸음, 방향 키는 버린다.
// - 메모, 회고, 로미에게 묻는 말, 닉네임, 검색어 원문은 넣지 않는다. 길이 구간(len_bucket)만 둔다.
//   검색어 0건 원문 저장은 미정이라 지금은 버린다.
// 이벤트 이름 목록을 서버가 막지는 않는다 — 이름 단일 소스는 iOS 쪽 enum이고(E 6절),
// 서버는 모양과 개인정보만 지킨다.

/** 버리는 속성 키. 소문자 비교, 접두나 접미로 붙은 것도 잡는다(예 user_lat, memo_text). */
const FORBIDDEN_KEY = /(^|_)(lat|lng|lon|latitude|longitude|location|coord|coords|gps|heading|bearing|altitude|step_count|pedometer|memo|recap|text|body|content|nickname|email|query|question|address)($|_)/i;

/**
 * 금지 단어가 들어 있지만 글 원문이 아닌 키(설계서 E 2-4가 정한 이름). 길이 구간이나 참거짓뿐이다.
 * 이걸 지우면 F-1(검색), W-13(회고) 측정이 서버에서 사라진다 — iOS는 보냈는데 칸이 비어 있었다.
 */
const SAFE_KEYS = new Set(["query_len", "answered_question"]);

/** 문자열 속성 최대 길이. 이보다 길면 글 원문일 가능성이 커서 버린다. */
const MAX_STRING = 80;

export function sanitizeProps(props: Record<string, unknown> | undefined): {
  props: Record<string, unknown>;
  dropped: string[];
} {
  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [k, v] of Object.entries(props ?? {})) {
    if (!SAFE_KEYS.has(k) && FORBIDDEN_KEY.test(k)) {
      dropped.push(k);
      continue;
    }
    if (typeof v === "string" && v.length > MAX_STRING) {
      dropped.push(k);
      continue;
    }
    out[k] = v;
  }
  return { props: out, dropped };
}

/** 운영 콘솔 "앱 이벤트" 요약. 순수 함수. */
export interface AppEventSummary {
  total: number;
  /** 서로 다른 설치(anon_id) 수. */
  installs: number;
  lastAt: string | null;
  byPlatform: { platform: string; count: number }[];
  byVersion: { platform: string; appVersion: string; count: number; lastAt: string }[];
  byName: { name: string; count: number; lastAt: string }[];
}

export function summarizeAppEvents(rows: import("@/lib/types").AppEventBrief[]): AppEventSummary {
  const count = <K extends string>(keyOf: (r: (typeof rows)[number]) => K) => {
    const m = new Map<K, { count: number; lastAt: string }>();
    for (const r of rows) {
      const k = keyOf(r);
      const cur = m.get(k);
      if (!cur) m.set(k, { count: 1, lastAt: r.createdAt });
      else {
        cur.count += 1;
        if (r.createdAt > cur.lastAt) cur.lastAt = r.createdAt;
      }
    }
    return [...m.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  };
  return {
    total: rows.length,
    installs: new Set(rows.map((r) => r.anonId).filter(Boolean)).size,
    lastAt: rows.reduce<string | null>((acc, r) => (!acc || r.createdAt > acc ? r.createdAt : acc), null),
    byPlatform: count((r) => r.platform || "알 수 없음").map(([platform, v]) => ({ platform, count: v.count })),
    byVersion: count((r) => `${r.platform || "?"}\u0000${r.appVersion ?? "?"}`).map(([k, v]) => {
      const [platform, appVersion] = k.split("\u0000");
      return { platform, appVersion, count: v.count, lastAt: v.lastAt };
    }),
    byName: count((r) => r.name || "(이름 없음)").map(([name, v]) => ({ name, count: v.count, lastAt: v.lastAt })),
  };
}
