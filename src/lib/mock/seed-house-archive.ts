// 2026 하우스 아카이브(HOUSE ARCHIVE) 시드 — SIBF·SIF와 공존하는 세 번째 전시.
// 부스 좌표는 공식 부스배치도를 옮긴 격자를 floorplan-house-archive.json으로.
// 카테고리는 존(기획존/부스존/테이블마켓)이 아니라 5개 테마(수집·관계·창작·쉼·탐험)로
// 잡는다 — 테마가 Roam 가치 슬러그와 거의 1:1로 붙어 deriveValueTags가 enrichment
// 없이도 첫날부터 의미 있는 추천 신호를 만든다. 부스 소개·이미지·인스타는 주최 측 브랜드
// 디렉터리에서 뽑아 enrichment-house-archive-2026.json으로 붙인다(68/104).
import haFloor from "@/lib/floorplan-house-archive.json";
import haEnrichData from "@/lib/booth/enrichment-house-archive-2026.json";
import { deriveValueTags } from "@/lib/values/derive";
import type {
  Booth,
  BoothEnrichment,
  Category,
  Exhibition,
  Hall,
} from "@/lib/types";

// image·images는 BoothEnrichment에 없는 생성 산출물 — 부스 이미지 경로다(스크립트/직접
// 수집이 채운다). image는 대표 로고 썸네일 하나, images는 부스 상세 갤러리에 쓰는
// 여러 장(있으면) — 인스타 최신 게시물 중 상품/작품샷을 골라 정사각으로 크롭한 것.
const haEnrich = haEnrichData as Record<
  string,
  Partial<BoothEnrichment> & { image?: string; images?: string[] }
>;

// 5개 테마 + 테이블 마켓. floorplan의 cat 키가 그대로 slug라 매핑 테이블이 필요 없다.
export const haCategories: Category[] = [
  { id: "cat_ha_collect", slug: "collect", name: "수집의 집", color: "#e879c4", icon: "Archive" },
  { id: "cat_ha_gather", slug: "gather", name: "관계의 집", color: "#eab308", icon: "Users" },
  { id: "cat_ha_make", slug: "make", name: "창작의 집", color: "#a8a29e", icon: "Hammer" },
  { id: "cat_ha_rest", slug: "rest", name: "쉼의 집", color: "#84cc16", icon: "Moon" },
  { id: "cat_ha_explore", slug: "explore", name: "탐험의 집", color: "#f97316", icon: "Compass" },
  { id: "cat_ha_table", slug: "table", name: "테이블 마켓", color: "#64748b", icon: "Store" },
];

const CAT_BY_SLUG = new Map(haCategories.map((c) => [c.slug, c]));

export const haExhibition: Exhibition = {
  id: "exh_house_archive_2026",
  slug: "house-archive-2026",
  name: "하우스 아카이브: 홈 디깅 페어",
  venue: "코엑스 더 플라츠 2층 (COEX The Platz)",
  description:
    "‘집’을 다섯 개의 방식으로 파고드는 홈 디깅 페어. 수집·관계·창작·쉼·탐험 다섯 테마의 집에 브랜드 부스와 테이블 마켓이 들어섭니다. 공식 부스배치도를 그대로 옮겨 실제 위치로 안내합니다.",
  startDate: "2026-08-13",
  endDate: "2026-08-16",
  // 공식 포스터(2309x3105 PNG 4.6MB) → 1289x1733 webp 178KB. 원본은 public에
  // 두지 않는다(배포 용량) — 재생성은 sharp resize({height:1733}).webp({quality:82}).
  coverImageUrl: "/house-archive-2026-cover.webp",
  mapImageUrl: undefined,
  mapWidth: haFloor.width,
  mapHeight: haFloor.height,
  tips: {
    transportation: "지하철 2호선 삼성역·9호선 봉은사역에서 코엑스 연결. 더 플라츠는 코엑스 2층입니다.",
    parking: "코엑스 지하주차장 이용. 대중교통을 권장합니다.",
    ticket: "온라인 예매 및 현장 구매.",
    guide: "다섯 테마의 집을 따라 브랜드를 둘러보고, 테이블 마켓에서 작은 물건을 만나보세요.",
  },
  organizerId: "org_house_archive",
  createdAt: "2026-07-29T00:00:00.000Z",
};

export const haHalls: Hall[] = [
  {
    id: "hall_ha",
    exhibitionId: haExhibition.id,
    name: "더 플라츠",
    floor: 2,
    sort: 0,
  },
];

type HaFloorBooth = {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  nameEn: string;
  cat: string;
  kind: "exhibitor" | "facility";
};

export const haBooths: Booth[] = (haFloor.booths as HaFloorBooth[]).map((b) => {
  const cat = CAT_BY_SLUG.get(b.cat) ?? CAT_BY_SLUG.get("table")!;
  const isPlanZone = b.code.startsWith("H");
  const tags = isPlanZone ? [cat.slug, "기획존"] : [cat.slug];
  // 주최 측 브랜드 디렉터리에서 뽑은 소개(68/104). 있으면 부스 상세에 노출되고,
  // 피드 카드에선 로미가 "발견 쪽 부스야" 같은 분류 대신 이 부스가 무엇을 하는
  // 곳인지를 말하는 재료가 된다(feed/grounding.ts). 재생성:
  // node scripts/gen-house-archive-enrichment.mjs
  const e = haEnrich[b.code];
  const enrichment: BoothEnrichment | undefined = e
    ? { ...e, goodsKeywords: e.goodsKeywords ?? [], themeTags: e.themeTags ?? [] }
    : undefined;
  return {
    id: `ha_${b.code.toLowerCase().replace(/-/g, "_")}`,
    exhibitionId: haExhibition.id,
    hallId: "hall_ha",
    categoryId: cat.id,
    code: b.code,
    kind: b.kind,
    name: b.name,
    company: cat.name,
    description: e?.summary ?? `${b.name} · 부스 ${b.code}`,
    longDescription: `${b.name}(${b.nameEn})의 부스입니다. 부스 번호 ${b.code}. 하우스 아카이브 ${cat.name} 참가 브랜드입니다.`,
    images: e?.images ?? (e?.image ? [e.image] : []),
    logoUrl: e?.image,
    websiteUrl: undefined,
    instagramUrl: e?.sourceUrl,
    tags,
    valueTags: deriveValueTags({ categorySlugs: tags }),
    enrichment,
    x: b.x,
    y: b.y,
    popularity: 50,
    createdAt: "2026-07-29T00:00:00.000Z",
  };
});
