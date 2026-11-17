// 행사 주소 이름(slug) 제안과 검사. 순수 함수, I/O 없음.
//
// 예전엔 이름에서 영문만 남기고, 하나도 안 남으면 조용히 "exhibition"을 썼다
// (exhibition-manager.tsx). 행사 이름은 대개 한글이라 두 번째 행사부터 id가 겹쳐 저장이
// 터지거나, 인입이 엉뚱한 행사를 찾았다. 이제는 제안을 화면에 보여 주고 고칠 수 있게 하며,
// 비었거나 이미 쓰는 주소는 저장 전에 막는다(2026-11-17 라운드 테이블 "지금" 1번).

/** 자주 쓰는 행사장의 영문 이름. 모르는 곳은 "fair"로 둔다(화면에 보이니 사람이 고친다). */
const VENUE_SLUGS: [RegExp, string][] = [
  [/코엑스\s*마곡|마곡/, "coex-magok"],
  [/코엑스|coex/i, "coex"],
  [/킨텍스|kintex/i, "kintex"],
  [/세텍|setec/i, "setec"],
  [/벡스코|bexco/i, "bexco"],
  [/aT\s*센터|at\s*center/i, "at-center"],
  [/동대문디자인플라자|ddp/i, "ddp"],
  [/수원메쎄|suwon\s*messe/i, "suwon-messe"],
  [/엑스코|exco/i, "exco"],
];

export const SLUG_PATTERN = /^[a-z0-9-]+$/;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "2026-11-26" → "2026-11". 날짜가 없으면 빈 값. */
function yearMonth(startDate: string | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(startDate ?? "");
  return m ? `${m[1]}-${m[2]}` : "";
}

/**
 * 제안 순서
 * 1. 이름에 영문이 있으면 그 영문(연도가 없으면 시작 연도를 붙인다). "Seoul Design Festival 2026" → "seoul-design-festival-2026"
 * 2. 없으면 행사장 + 시작 연월. "코엑스" + 2026-11-26 → "coex-2026-11"
 * 3. 행사장도 모르면 "fair-2026-11"
 * 날짜도 없으면 빈 값을 돌려준다 — 화면이 "주소를 적어 주세요"로 막는다(일반 이름을 지어내지 않는다).
 */
export function suggestExhibitionSlug(input: { name?: string; venue?: string; startDate?: string }): string {
  const ym = yearMonth(input.startDate);
  const english = slugify(input.name ?? "");
  // 숫자만 남은 경우("2026 문구전" → "2026")는 영문 이름으로 치지 않는다.
  if (/[a-z]/.test(english) && english.length >= 2) {
    const year = ym.slice(0, 4);
    return year && !english.includes(year) ? `${english}-${year}` : english;
  }
  if (!ym) return "";
  const venue = VENUE_SLUGS.find(([re]) => re.test(input.venue ?? ""))?.[1] ?? "fair";
  return `${venue}-${ym}`;
}

/** 저장해도 되는 주소인지. 문제가 있으면 화면에 띄울 해요체 한 줄. */
export function checkExhibitionSlug(
  slug: string,
  existing: { id: string; slug: string; name: string }[],
  editingId?: string | null,
): string | null {
  const s = slug.trim();
  if (!s) return "주소 이름을 적어 주세요. 영문 소문자, 숫자, 하이픈으로 적어요";
  if (!SLUG_PATTERN.test(s)) return "주소 이름은 영문 소문자, 숫자, 하이픈만 쓸 수 있어요";
  if (s.length < 2) return "주소 이름은 두 글자 이상 적어 주세요";
  const taken = existing.find((e) => e.slug === s && e.id !== editingId);
  if (taken) return `이미 "${taken.name}" 행사가 이 주소를 쓰고 있어요. 다른 주소로 바꿔 주세요`;
  return null;
}
