// 2026 서울일러스트레이션페어(SIF) 시드 — SIBF와 공존하는 두 번째 전시.
// 부스 좌표는 공식 부스배치도(ocreo /map)에서 옮긴 격자를 floorplan-sif.json으로,
// 참가자(코드·상호·국내외·작가/기업)는 ocreo fairParticipantList에서 이관.
// 색은 안 가져온다 — 지도는 Roam 상태색, 카테고리는 Roam 팔레트.
import sifFloor from "@/lib/floorplan-sif.json";
import sifMedia from "@/lib/booth/media-sif-2026.json";
import sifEnrich from "@/lib/booth/enrichment-sif-2026.json";
import sifLinks from "@/lib/booth/links-sif-2026.json";
import { deriveValueTags } from "@/lib/values/derive";
import type { Booth, Category, Exhibition, Hall } from "@/lib/types";

// 부스별 미디어(포트폴리오 이미지·로고) — ocreo fairParticipantList에서 이관.
// code → { images, logo }. 상세 갤러리·히어로 로고에 노출.
const media = sifMedia as Record<
  string,
  { images: string[]; logo: string | null }
>;

// 부스별 굿즈 enrichment — ocreo fairStory(굿즈 프리뷰)에서 이관.
// goodsKeywords는 deriveValueTags에 들어가 추천 가치신호를 강화하고,
// storyImages는 포트폴리오가 적은 부스의 이미지를 보강한다.
const enrich = sifEnrich as Record<
  string,
  { goodsKeywords?: string[]; storyImages?: string[] }
>;

// 부스별 링크·소개 — ocreo userProfileByUserId에서 이관. 인스타/웹 링크는 부스
// 외부 링크로, 작가 자기소개(intro)는 부스 요약(enrichment.summary)으로.
const links = sifLinks as Record<
  string,
  { instagram?: string; website?: string; intro?: string }
>;

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
    "‘평행우주의 만남(V.21)’을 주제로 열리는 국내 최대 규모의 일러스트레이션 페어. 국내외 일러스트레이터·창작 브랜드 부스가 코엑스 C홀에 들어섭니다. 공식 부스배치도를 그대로 옮겨 실제 위치로 안내하고, 관심 가는 작가·부스를 골라 둘러봐요.",
  startDate: "2026-07-30",
  endDate: "2026-08-02",
  coverImageUrl: "/sif-2026-cover.webp",
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
    const m = media[b.code];
    const en = enrich[b.code];
    const lk = links[b.code];
    const goodsKeywords = en?.goodsKeywords ?? [];
    // 포트폴리오 이미지 우선, 부족하면 스토리(굿즈) 이미지로 보강(중복 제거, 6장 캡).
    const images = [
      ...new Set([...(m?.images ?? []), ...(en?.storyImages ?? [])]),
    ].slice(0, 6);
    // 굿즈 키워드나 작가 소개가 있으면 enrichment 구성(소개=요약).
    const enrichment =
      goodsKeywords.length > 0 || lk?.intro
        ? {
            goodsKeywords,
            themeTags: [] as string[],
            ...(lk?.intro ? { summary: lk.intro } : {}),
          }
        : undefined;
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
      images,
      logoUrl: m?.logo ?? undefined,
      websiteUrl: lk?.website ?? undefined,
      instagramUrl: lk?.instagram ?? undefined,
      tags,
      // goodsKeywords를 넣어 가치 태그 도출을 강화(굿즈 성향 반영).
      valueTags: deriveValueTags({ categorySlugs: tags, goodsKeywords }),
      enrichment,
      x: b.x,
      y: b.y,
      popularity: 50,
      createdAt: "2026-01-05T00:00:00.000Z",
    };
  },
);
