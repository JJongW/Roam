// 관람 가치 태그 파생 — 분야(category)+enrichment(굿즈·팁)에서 결정론으로 가치 태그를 만든다.
// 수동 valueTags가 있으면 그걸 우선. 콘텐츠가 없어도 전 부스가 가치 축을 갖게 하는 부트스트랩.
// 순수·결정론, LLM 없음.
import type { BoothValueTag } from "@/lib/types";
import { clamp } from "@/lib/utils";

export interface DeriveValueInput {
  /** 분야 slug들(booth.tags). */
  categorySlugs?: string[];
  goodsKeywords?: string[];
  tips?: string;
  /** enrichment의 수동 가치 태그 — 있으면 파생 대신 이걸 정규화해 반환. */
  manual?: BoothValueTag[];
}

/** 분야 slug → 기본 가치 기여. */
const CATEGORY_BASE: Record<string, Array<[string, number]>> = {
  lit: [
    ["learning", 0.5],
    ["discovery", 0.3],
  ],
  humanities: [
    ["learning", 0.6],
    ["social", 0.2],
  ],
  science: [
    ["learning", 0.5],
    ["trend", 0.3],
  ],
  art: [
    ["inspiration", 0.6],
    ["discovery", 0.3],
  ],
  children: [
    ["experience", 0.5],
    ["inspiration", 0.3],
  ],
  general: [["discovery", 0.4]],
};

/** tips 텍스트 → 가치 기여(정규식 키워드). */
const TIP_RULES: Array<[RegExp, Array<[string, number]>]> = [
  [/체험|만들|워크숍|해보|참여/, [["experience", 0.4]]],
  [
    /사인회|토크|낭독|공연|이벤트|미니토크|대담/,
    [
      ["social", 0.4],
      ["discovery", 0.2],
    ],
  ],
  [/신간|화제|인기|베스트|트렌드|요즘/, [["trend", 0.4]]],
  [/독립|1인|소형|작은|인디/, [["discovery", 0.4]]],
  [/굿즈|한정|에코백|키링|스티커/, [["goods", 0.3]]],
  [/전시|작품|일러스트|그림|사진|디자인/, [["inspiration", 0.3]]],
  [/조용|한산|여유|가볍게/, [["rest", 0.3]]],
];

export function deriveValueTags(input: DeriveValueInput): BoothValueTag[] {
  if (input.manual && input.manual.length > 0) {
    return normalize(
      input.manual.map((t) => [t.slug, t.strength] as [string, number]),
    );
  }

  const acc = new Map<string, number>();
  const add = (slug: string, amt: number) =>
    acc.set(slug, (acc.get(slug) ?? 0) + amt);

  for (const cat of input.categorySlugs ?? []) {
    for (const [slug, amt] of CATEGORY_BASE[cat] ?? []) add(slug, amt);
  }
  if ((input.goodsKeywords?.length ?? 0) > 0) {
    add("goods", clamp(0.4 + (input.goodsKeywords!.length - 1) * 0.1, 0, 0.8));
  }
  if (input.tips) {
    for (const [re, contribs] of TIP_RULES) {
      if (re.test(input.tips))
        for (const [slug, amt] of contribs) add(slug, amt);
    }
  }
  if (acc.size === 0) add("discovery", 0.3); // 최소 하나 보장

  return normalize([...acc.entries()]);
}

/** 강도 clamp(0..1)·slug별 합산·내림차순·상위 4개. */
function normalize(pairs: Array<[string, number]>): BoothValueTag[] {
  const merged = new Map<string, number>();
  for (const [slug, s] of pairs) {
    merged.set(slug, clamp((merged.get(slug) ?? 0) + s, 0, 1));
  }
  return [...merged.entries()]
    .map(([slug, strength]) => ({ slug, strength }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, 4);
}
