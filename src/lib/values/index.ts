// 관람 가치 taxonomy — 부스를 "분야"가 아니라 "관람 가치"로 번역하는 새 축.
// 분야(Category)와 병행. 스코어링·L4 브레인·피드의 관심 축이 이 slug을 쓴다.
// Category와 호환되는 형태(slug/label/color/icon)라 category-chip 재사용 가능.

export interface ValueTagDef {
  slug: string;
  label: string;
  /** hex — CategoryChip 색 규약과 호환. */
  color: string;
  /** lucide 아이콘 이름. */
  icon: string;
  hint: string;
}

export const VALUE_TAGS: ValueTagDef[] = [
  { slug: "discovery", label: "발견", color: "#7c6cff", icon: "Compass", hint: "몰랐던 곳·독립·발굴" },
  { slug: "experience", label: "체험", color: "#12b76a", icon: "Hand", hint: "직접 해보는 재미" },
  { slug: "sensory", label: "오감", color: "#f79009", icon: "Sparkles", hint: "감각·분위기·전시성" },
  { slug: "trend", label: "트렌드", color: "#ee46bc", icon: "TrendingUp", hint: "화제·신간·요즘" },
  { slug: "goods", label: "굿즈", color: "#f04438", icon: "ShoppingBag", hint: "굿즈·한정판·구매" },
  { slug: "learning", label: "배움", color: "#0ba5ec", icon: "BookOpen", hint: "정보·상담·알아감" },
  { slug: "rest", label: "휴식", color: "#667085", icon: "Coffee", hint: "가볍게·조용히" },
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
