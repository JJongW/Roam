// 2026 서울일러스트레이션페어(SIF) 시드 — SIBF와 공존하는 두 번째 전시.
// 부스 좌표는 공식 부스배치도(ocreo /map)에서 옮긴 격자를 floorplan-sif.json으로,
// 참가자(코드·상호·국내외·작가/기업)는 ocreo fairParticipantList에서 이관.
// 색은 안 가져온다 — 지도는 Roam 상태색, 카테고리는 Roam 팔레트.
import sifFloor from "@/lib/floorplan-sif.json";
import { deriveValueTags } from "@/lib/values/derive";
import type { Booth, Category, Exhibition, Hall } from "@/lib/types";

// 참가자 4분류(작가/기업 × 국내/해외). floorplan의 cat 키 → Roam 카테고리.
export const sifCategories: Category[] = [
  {
    id: "cat_sif_kr_artist",
    slug: "kr-artist",
    name: "국내 작가",
    color: "#3182f6",
    icon: "User",
  },
  {
    id: "cat_sif_kr_biz",
    slug: "kr-biz",
    name: "국내 기업",
    color: "#15c47e",
    icon: "Building2",
  },
  {
    id: "cat_sif_intl_artist",
    slug: "intl-artist",
    name: "해외 작가",
    color: "#8b5cf6",
    icon: "Globe",
  },
  {
    id: "cat_sif_intl_biz",
    slug: "intl-biz",
    name: "해외 기업",
    color: "#ff8a3d",
    icon: "Briefcase",
  },
];

const CAT_BY_KEY: Record<string, { id: string; slug: string; name: string }> = {
  "dom-artist": {
    id: "cat_sif_kr_artist",
    slug: "kr-artist",
    name: "국내 작가",
  },
  "dom-biz": { id: "cat_sif_kr_biz", slug: "kr-biz", name: "국내 기업" },
  "intl-artist": {
    id: "cat_sif_intl_artist",
    slug: "intl-artist",
    name: "해외 작가",
  },
  "intl-biz": { id: "cat_sif_intl_biz", slug: "intl-biz", name: "해외 기업" },
};

export const sifExhibition: Exhibition = {
  id: "exh_sif_2026",
  slug: "sif-2026",
  name: "2026 서울일러스트레이션페어",
  venue: "코엑스 C홀, 서울 (COEX Hall C)",
  description:
    "국내외 일러스트레이터·창작 브랜드가 한자리에 모이는 국내 최대 규모의 일러스트레이션 페어. 공식 부스배치도를 그대로 옮겨 실제 위치로 안내하고, 관심 가는 작가·부스를 골라 둘러봐요.",
  startDate: "2026-07-30",
  endDate: "2026-08-02",
  coverImageUrl: undefined,
  mapImageUrl: undefined,
  mapWidth: sifFloor.width,
  mapHeight: sifFloor.height,
  tips: {
    transportation:
      "지하철 2호선 삼성역·9호선 봉은사역에서 코엑스 연결. C홀은 코엑스 1층입니다.",
    parking:
      "코엑스 지하주차장 이용. 페어 기간 혼잡하니 대중교통을 권장합니다.",
    ticket: "온라인 예매 및 현장 구매.",
    guide:
      "국내·해외 작가와 창작 브랜드 부스, 굿즈, 신작을 만나보세요. 관심 부스를 골라두면 지도에서 모아볼 수 있어요.",
  },
  organizerId: "org_sif",
  createdAt: "2026-01-05T00:00:00.000Z",
};

export const sifHalls: Hall[] = [
  {
    id: "hall_sif",
    exhibitionId: sifExhibition.id,
    name: "전시장",
    floor: 1,
    sort: 0,
  },
];

type SifFloorBooth = {
  code: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name: string;
  cat: string;
};

export const sifBooths: Booth[] = (sifFloor.booths as SifFloorBooth[]).map(
  (b) => {
    const cat = CAT_BY_KEY[b.cat] ?? CAT_BY_KEY["dom-artist"];
    const tags = [cat.slug];
    return {
      id: `sif_${b.code.toLowerCase()}`,
      exhibitionId: sifExhibition.id,
      hallId: "hall_sif",
      categoryId: cat.id,
      code: b.code,
      kind: "exhibitor" as const,
      name: b.name,
      company: cat.name,
      description: `${b.name} · 부스 ${b.code}`,
      longDescription: `${b.name}의 부스입니다. 부스 번호 ${b.code}. 2026 서울일러스트레이션페어 참가 ${cat.name}입니다.`,
      images: [],
      websiteUrl: undefined,
      tags,
      valueTags: deriveValueTags({ categorySlugs: tags }),
      x: b.x,
      y: b.y,
      popularity: 50,
      createdAt: "2026-01-05T00:00:00.000Z",
    };
  },
);
