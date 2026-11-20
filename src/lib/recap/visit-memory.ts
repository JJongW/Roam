// UI 12 회고 글(오늘은 여기까지). 쓴 말을 고치지 않고 이 브라우저에만 둔다.
//
// - iOS `VisitMemory.swift`와 같은 키(`roam.visitMemory.<slug>`, `.date`)와 같은 규칙(박람회당 하나,
//   300자, 앞뒤 공백만 있으면 빈 칸). 서버에는 글 칸이 없다(설계서 C UI 12 [사실]).
// - 그래서 로그인해도 글은 계정에 올라가지 않는다. 화면 문구도 그만큼만 말한다(12-04).
// - 저장이 막힌 브라우저(사생활 보호 창 등)에서는 조용히 실패하고 화면은 막히지 않는다.

export const RECAP_MAX = 300;

const key = (slug: string) => `roam.visitMemory.${slug}`;
const dateKey = (slug: string) => `roam.visitMemory.${slug}.date`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** 앞뒤 공백을 걷고 300자로 자른다. 빈 칸이면 "". */
export function cleanRecap(text: string): string {
  return text.trim().slice(0, RECAP_MAX);
}

export function readRecap(slug: string): { text: string; date: string | null } {
  const s = storage();
  try {
    return { text: s?.getItem(key(slug)) ?? "", date: s?.getItem(dateKey(slug)) ?? null };
  } catch {
    return { text: "", date: null };
  }
}

/** 남기면 true. 빈 칸이거나 저장이 막히면 false. */
export function saveRecap(slug: string, text: string, now = new Date()): boolean {
  const t = cleanRecap(text);
  const s = storage();
  if (!t || !s) return false;
  try {
    s.setItem(key(slug), t);
    s.setItem(dateKey(slug), now.toISOString());
    return true;
  } catch {
    return false;
  }
}
