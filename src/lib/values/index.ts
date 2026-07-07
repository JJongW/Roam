// 관람 가치 taxonomy — 부스를 "분야"가 아니라 "관람 가치"로 번역하는 새 축.
// 분야(Category)와 병행. 스코어링·L4 브레인·피드의 관심 축이 이 slug을 쓴다.
// Category와 호환되는 형태(slug/label/color/icon)라 category-chip 재사용 가능.
import type { Booth } from "@/lib/types";

export interface ValueTagDef {
  slug: string;
  label: string;
  /** hex — CategoryChip 색 규약과 호환. */
  color: string;
  /** lucide 아이콘 이름. */
  icon: string;
  hint: string;
}

// 캐논 8개(기획 §7.2 관람 가치 온보딩): 발견·체험·굿즈·소통·학습·트렌드·영감·가볍게.
export const VALUE_TAGS: ValueTagDef[] = [
  {
    slug: "discovery",
    label: "발견",
    color: "#7c6cff",
    icon: "Compass",
    hint: "몰랐던 곳·독립·발굴",
  },
  {
    slug: "experience",
    label: "체험",
    color: "#12b76a",
    icon: "Hand",
    hint: "직접 해보는 재미",
  },
  {
    slug: "goods",
    label: "굿즈",
    color: "#f04438",
    icon: "ShoppingBag",
    hint: "구매·굿즈·한정판",
  },
  {
    slug: "social",
    label: "소통",
    color: "#0e9384",
    icon: "MessagesSquare",
    hint: "사람·대화·교류",
  },
  {
    slug: "learning",
    label: "학습",
    color: "#0ba5ec",
    icon: "BookOpen",
    hint: "정보·상담·알아감",
  },
  {
    slug: "trend",
    label: "트렌드",
    color: "#ee46bc",
    icon: "TrendingUp",
    hint: "화제·신간·요즘",
  },
  {
    slug: "inspiration",
    label: "영감",
    color: "#f79009",
    icon: "Lightbulb",
    hint: "감각·작품·영감",
  },
  {
    slug: "rest",
    label: "가볍게",
    color: "#667085",
    icon: "Coffee",
    hint: "가볍게·조용히",
  },
];

export const VALUE_SLUGS = VALUE_TAGS.map((v) => v.slug);

const BY_SLUG = new Map(VALUE_TAGS.map((v) => [v.slug, v]));

export function valueDef(slug: string): ValueTagDef | undefined {
  return BY_SLUG.get(slug);
}

/** 가치 slug → 한국어 라벨(없으면 slug 그대로). */
export function valueLabel(slug: string): string {
  return BY_SLUG.get(slug)?.label ?? slug;
}

/**
 * 부스의 관심 축 slug — valueTags 있으면 가치 slug, 없으면 booth.tags(분야) 폴백.
 * 스코어링·신호 적재가 이걸 써서, 데이터가 채워지기 전엔 분야 축으로 안전하게 동작한다.
 */
export function boothValueSlugs(
  booth: Pick<Booth, "valueTags" | "tags">,
): string[] {
  return booth.valueTags && booth.valueTags.length > 0
    ? booth.valueTags.map((v) => v.slug)
    : booth.tags;
}
