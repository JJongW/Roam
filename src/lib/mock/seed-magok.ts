// 2026 마곡리빙마켓 시드 — 네 번째 전시. venue(coex-magok-1f) 위에 배치만 얹는
// 첫 사례라, 벽·출입구·화장실은 여기 없다(장소가 안다).
// 부스 좌표·이름은 주최 포스터에서 뽑아 floorplan-magok-livingmarket.json으로.
// 카테고리는 주최가 쓰는 4개 존을 그대로 쓴다 — 도면 색이 곧 존이라 방문객이
// 종이 도면과 앱을 오가며 같은 언어를 본다.
import mlmFloor from "@/lib/floorplan-magok-livingmarket.json";
import { deriveValueTags } from "@/lib/values/derive";
import type { Booth, Category, Exhibition, Hall } from "@/lib/types";

export const mlmCategories: Category[] = [
  { id: "cat_mlm_home", slug: "home-deco", name: "Home & Deco", color: "#5bb8e8", icon: "Lamp" },
  { id: "cat_mlm_food", slug: "food-taste", name: "Food & Taste", color: "#63bf7d", icon: "Utensils" },
  { id: "cat_mlm_space", slug: "space-style", name: "Space & Style", color: "#e0559c", icon: "Sofa" },
  { id: "cat_mlm_hobby", slug: "hobby-kitchen", name: "Hobby & Play / Kitchen & Tableware", color: "#f0a93c", icon: "Palette" },
  { id: "cat_mlm_special", slug: "mlm-special", name: "Special", color: "#8c82c8", icon: "Star" },
];

const CAT_BY_SLUG = new Map(mlmCategories.map((c) => [c.slug, c]));

export const mlmExhibition: Exhibition = {
  id: "exh_magok_livingmarket_2026",
  slug: "magok-livingmarket-2026",
  name: "2026 마곡리빙마켓",
  venue: "코엑스 마곡 컨벤션센터 1층",
  description:
    "리빙·푸드·공예 브랜드 138곳이 모이는 마곡리빙마켓. Home & Deco, Food & Taste, Space & Style, Hobby & Play 네 구역으로 나뉘고, 공식 부스배치도를 그대로 옮겨 실제 위치로 안내합니다.",
  startDate: "2026-09-10",
  endDate: "2026-09-13",
  coverImageUrl: "/booths/magok-livingmarket-2026/livingmarket_poster.png",
  mapImageUrl: undefined,
  mapWidth: mlmFloor.width,
  mapHeight: mlmFloor.height,
  tips: {
    transportation: "지하철 5호선 발산역·9호선 마곡나루역에서 도보. 코엑스 마곡 컨벤션센터 1층입니다.",
    parking: "건물 주차장 이용. 대중교통을 권장합니다.",
    ticket: "현장 무료 입장.",
    // 관람시간은 요일마다 다르다 — 주말이 한 시간 일찍 닫는다.
    guide: "9/10(목)·9/11(금) 10:30–19:00, 9/12(토)·9/13(일) 10:30–18:00. 서측·동측 두 출입구가 있고 가운데 가든라운지에서 쉴 수 있습니다.",
  },
  organizerId: "org_magok_livingmarket",
  createdAt: "2026-09-07T00:00:00.000Z",
};

export const mlmHalls: Hall[] = [
  { id: "hall_mlm", exhibitionId: mlmExhibition.id, name: "마곡 컨벤션센터 1층", floor: 1, sort: 0 },
];

type MlmFloorBooth = {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  cat: string;
  kind: "exhibitor" | "facility";
};

export const mlmBooths: Booth[] = (mlmFloor.booths as MlmFloorBooth[]).map((b) => {
  const cat = CAT_BY_SLUG.get(b.cat === "special" ? "mlm-special" : b.cat)!;
  const tags = [cat.slug];
  return {
    id: `mlm_${b.code.toLowerCase().replace(/-/g, "_")}`,
    exhibitionId: mlmExhibition.id,
    hallId: "hall_mlm",
    categoryId: cat.id,
    code: b.code,
    kind: b.kind,
    name: b.name,
    // 138곳 중 81곳은 주최 사이트에도 소개가 없다 — 이름 말고는 근거가 없는
    // 상태 그대로 둔다. 지어내면 근거 카드가 거짓을 말한다.
    company: cat.name,
    description: `${b.name} · 부스 ${b.code}`,
    longDescription: `${b.name}의 부스입니다. 부스 번호 ${b.code}, ${cat.name} 구역.`,
    images: [],
    logoUrl: undefined,
    websiteUrl: undefined,
    instagramUrl: undefined,
    tags,
    valueTags: deriveValueTags({ categorySlugs: tags }),
    enrichment: undefined,
    // 도면은 좌상단 기준, Booth는 중심 기준이다(합성기와 같은 규약).
    x: b.x + b.w / 2,
    y: b.y + b.h / 2,
    popularity: 50,
    createdAt: "2026-09-07T00:00:00.000Z",
  };
});
