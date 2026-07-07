import floorplan from "@/lib/floorplan-sibf.json";
import officialDirectory from "@/lib/booth/official-sibf-2026.json";
import enrichmentData from "@/lib/booth/enrichment-sibf-2026.json";
import standingEvents from "@/lib/sibf-events-standing.json";
import programSchedule from "@/lib/sibf-events-program.json";
import { normalizeBoothKey } from "@/lib/booth/normalize";
import { deriveValueTags } from "@/lib/values/derive";
import type {
  Booth,
  BoothEnrichment,
  BoothEvent,
  Category,
  CommunityPost,
  Exhibition,
  Hall,
  Review,
  WelcomeKit,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// 2026 서울국제도서전 (Seoul International Book Fair) — COEX Hall A & B1.
// Booth geometry (codes, exact varied rects, colors) is traced from the
// official interactive floorplan SVG (sibf.kr/page/22) → src/lib/floorplan-sibf.json.
// Booth names are baked as vector graphics on the official map and are not
// machine-readable, so booths are identified by their real stand code (e.g. A1902).
// ---------------------------------------------------------------------------

export const categories: Category[] = [
  {
    id: "cat_lit",
    slug: "lit",
    name: "문학",
    color: "#f04452",
    icon: "BookOpen",
  },
  {
    id: "cat_children",
    slug: "children",
    name: "아동·그림책",
    color: "#ff8a3d",
    icon: "Blocks",
  },
  {
    id: "cat_humanities",
    slug: "humanities",
    name: "인문·사회",
    color: "#3182f6",
    icon: "Landmark",
  },
  {
    id: "cat_art",
    slug: "art",
    name: "예술·디자인",
    color: "#8b5cf6",
    icon: "Palette",
  },
  {
    id: "cat_science",
    slug: "science",
    name: "과학·기술",
    color: "#15c47e",
    icon: "FlaskConical",
  },
  {
    id: "cat_general",
    slug: "general",
    name: "종합",
    color: "#6b7684",
    icon: "Library",
  },
];

const CAT: Record<string, string> = Object.fromEntries(
  categories.map((c) => [c.slug, c.id]),
);

export const exhibition: Exhibition = {
  id: "exh_sibf_2026",
  slug: "sibf-2026",
  name: "2026 서울국제도서전",
  venue: "코엑스 A·B1홀, 서울 (COEX Hall A & B1)",
  description:
    "‘한 걸음(One Small Step)’을 주제로 열리는 국내 최대 규모의 책 축제. A홀·B1홀에 국내외 출판사 부스가 들어섭니다. 공식 부스배치도를 그대로 옮겨 실제 위치·크기로 길을 안내해요.",
  startDate: "2026-06-24",
  endDate: "2026-06-28",
  coverImageUrl:
    "https://res.cloudinary.com/decb4pqj0/image/upload/f_auto,q_auto,w_1200/v1782138259/roam/exhibitions/sibf-2026-keyvisual.jpg",
  mapImageUrl: undefined,
  mapWidth: floorplan.width,
  mapHeight: floorplan.height,
  tips: {
    transportation:
      "지하철 2호선 삼성역 5·6번 출구 또는 9호선 봉은사역에서 코엑스로 연결. A·B1홀은 코엑스 1층입니다.",
    parking:
      "코엑스 지하주차장 이용. 도서전 기간 혼잡하니 대중교통을 권장합니다.",
    ticket:
      "온라인 예매 및 현장 구매. 단체 티켓 신청 마감 6/8. 문의 sibf@sibf.kr / 02-702-0670(내선 4254).",
    guide:
      "운영시간 11:00–20:00. 주제 강연, 기획 전시, 작가 사인회·낭독회, 해외관을 즐겨보세요.",
  },
  organizerId: "org_sibf",
  createdAt: "2026-01-02T00:00:00.000Z",
};

export const halls: Hall[] = [
  {
    id: "hall_a",
    exhibitionId: exhibition.id,
    name: "Hall A",
    floor: 1,
    sort: 0,
  },
  {
    id: "hall_b",
    exhibitionId: exhibition.id,
    name: "Hall B1",
    floor: 1,
    sort: 1,
  },
];

const id = (code: string) => `b_${code.toLowerCase()}`;

// code → all co-located exhibitor names from the official SIBF directory.
const directory = officialDirectory as unknown as Record<string, string[]>;

// code → 수동 주입한 추가정보(굿즈·테마·팁). booth-data-entry로 채운다.
const enrichmentByCode = enrichmentData as unknown as Record<
  string,
  Partial<BoothEnrichment>
>;

export const booths: Booth[] = floorplan.booths.map((b) => {
  const name = (b as { name?: string }).name || b.code;
  const kind =
    (b as { kind?: string }).kind === "facility" ? "facility" : "exhibitor";
  // Co-located exhibitors at this code, minus the one shown as the booth name.
  // Dedup by containment too, since directory names are suffix/prefix-cleaned
  // ("도서출판 달리" on the map vs "달리" in the directory).
  const officialNames = Array.isArray(directory[b.code])
    ? directory[b.code]
    : [];
  const nameKey = normalizeBoothKey(name);
  const aliasList =
    kind === "exhibitor"
      ? officialNames.filter((nm) => {
          const k = normalizeBoothKey(nm);
          return (
            k.length >= 2 &&
            k !== nameKey &&
            !nameKey.includes(k) &&
            !k.includes(nameKey)
          );
        })
      : [];
  const catReal = (b as { catReal?: string }).catReal ?? "general";
  const catKo = (b as { catKo?: string }).catKo ?? "";
  const web = (b as { web?: string }).web || undefined;
  // catKo is a full taxonomy dump (e.g. "총류, 철학, 종교, …"). Showing it in the
  // header overwhelms the name/location, so the header carries a short
  // representative ("총류 외 14"); the full list stays in longDescription.
  const cats = catKo
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const companyLabel =
    kind === "facility"
      ? "부대 공간"
      : cats.length <= 1
        ? (cats[0] ?? "")
        : `${cats[0]} 외 ${cats.length - 1}`;
  // Facility slots (lounge/stage/aux) aren't exhibitors — no participant blurb.
  const longDescription =
    kind === "facility"
      ? `${name} · ${b.code}. 참가사 부스가 아닌 행사장 부대 공간이에요.`
      : `${name}의 부스입니다. 부스 번호 ${b.code}.${
          catKo ? ` 분야: ${catKo}.` : ""
        } 현장에서 신간 전시와 굿즈, 사인회를 만나볼 수 있어요. 2026 서울국제도서전 참가사입니다.`;
  // 수동 주입 추가정보. themeTags(=카테고리 slug)는 tags에 병합해 추천
  // 스코어링에 LLM 없이 반영하고, 굿즈/요약/팁은 enrichment로 부스에 붙인다.
  const e = enrichmentByCode[b.code];
  const enrichment: BoothEnrichment | undefined =
    e && kind === "exhibitor"
      ? {
          goodsKeywords: e.goodsKeywords ?? [],
          themeTags: e.themeTags ?? [],
          summary: e.summary,
          tips: e.tips,
          sourceUrl: e.sourceUrl,
          valueTags: e.valueTags,
          roamInterpretation: e.roamInterpretation,
          timing: e.timing,
          memoryHooks: e.memoryHooks,
          conversationPrompts: e.conversationPrompts,
          confidence: e.confidence,
        }
      : undefined;
  const tags = enrichment?.themeTags?.length
    ? [...new Set([catReal, ...enrichment.themeTags])]
    : [catReal];
  // 관람 가치 태그 파생(수동 valueTags 우선) — 분야+굿즈·팁에서 결정론 도출.
  const valueTags = deriveValueTags({
    categorySlugs: tags,
    goodsKeywords: enrichment?.goodsKeywords,
    tips: enrichment?.tips,
    manual: enrichment?.valueTags,
  });
  return {
    id: id(b.code),
    exhibitionId: exhibition.id,
    hallId: b.code[0] === "A" ? "hall_a" : "hall_b",
    categoryId: CAT[catReal] ?? CAT.general,
    code: b.code,
    kind,
    name,
    company: companyLabel,
    aliases: aliasList.length ? aliasList : undefined,
    description: `${name} · 부스 ${b.code}`,
    longDescription,
    images: [],
    logoUrl: undefined,
    instagramUrl: undefined,
    websiteUrl: web,
    tags,
    valueTags,
    enrichment,
    x: b.x,
    y: b.y,
    popularity: 50,
    createdAt: "2026-01-05T00:00:00.000Z",
  };
});

const has = (code: string) => booths.some((b) => b.code === code);
const pick = (code: string, fallback: string) => (has(code) ? code : fallback);

const day = "2026-06-24";
function at(h: number, m = 0): string {
  return new Date(
    `${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+09:00`,
  ).toISOString();
}

// Anchor demo reviews / community posts to real stands.
const EV_A = pick("A1902", booths[0].code!);
const EV_B = pick("A2402", booths[1].code!);
const EV_D = pick("B400", booths[3].code!);

// Standing (상시) booth events from the official SIBF program
// (src/lib/sibf-events-standing.json). Run the whole fair → standing: true.
const FAIR_START = new Date("2026-06-24T10:00:00+09:00").toISOString();
const FAIR_END = new Date("2026-06-28T18:00:00+09:00").toISOString();
const standing: BoothEvent[] = standingEvents
  .filter((e) => has(e.code))
  .map((e, i) => ({
    id: `evs_${i + 1}`,
    boothId: id(e.code),
    title: e.title,
    description: e.description,
    startTime: FAIR_START,
    endTime: FAIR_END,
    tag: e.tag,
    standing: true,
  }));

// Timed reader programs (강연·북토크·세미나) at the special venues, from the
// official reservation schedule (src/lib/sibf-events-program.json). Venue → code.
const VENUE: Record<string, string> = {
  책마당: "B704",
  책만남홀1: "A2402",
  책만남홀2: "A1901",
  "프랑스 주빈관 (A601)": "A601",
};
function ts(date: string, hm: string): string {
  return new Date(`${date}T${hm}:00+09:00`).toISOString();
}
const program: BoothEvent[] = Object.entries(programSchedule).flatMap(
  ([date, items]) =>
    items
      .map((p, i): BoothEvent | null => {
        const code = VENUE[p.place];
        if (!code || !has(code)) return null;
        return {
          id: `evp_${date}_${i + 1}`,
          boothId: id(code),
          title: p.title,
          description: "",
          startTime: ts(date, p.startTime),
          endTime: ts(date, p.endTime),
          tag: p.tag,
          speaker: p.speaker ?? undefined,
        };
      })
      .filter((e): e is BoothEvent => e !== null),
);

export const events: BoothEvent[] = [...standing, ...program];

const W = booths.slice(0, 8).map((b) => b.code!);

export const welcomeKits: WelcomeKit[] = [
  {
    boothId: id(EV_D),
    enabled: true,
    name: "라운지 에코백",
    description: "도서전 한정 굿즈",
    remainingCount: 300,
  },
  {
    boothId: id(EV_A),
    enabled: true,
    name: "아트 포스터",
    description: "현장 한정 포스터",
    remainingCount: 150,
  },
];

export const reviews: Review[] = [
  {
    id: "rv1",
    boothId: id(EV_A),
    sessionId: "seed",
    comment: "전시 구성이 알차요. 추천!",
    authorName: "지민",
    createdAt: at(14, 40),
  },
  {
    id: "rv2",
    boothId: id(EV_B),
    sessionId: "seed",
    comment: "신간 할인 폭이 커요.",
    authorName: "현우",
    createdAt: at(15, 20),
  },
  {
    id: "rv3",
    boothId: id(W[0]),
    sessionId: "seed",
    comment: "굿즈 예쁘고 직원분 친절해요.",
    authorName: "수아",
    createdAt: at(13, 30),
  },
];

export const communityPosts: CommunityPost[] = [
  {
    id: "cp1",
    exhibitionId: exhibition.id,
    sessionId: "seed",
    authorName: "민지",
    body: `${EV_A} 사인회 대기 30분 넘어요. 지금은 한산한 쪽부터 도세요!`,
    boothId: id(EV_A),
    createdAt: at(13, 30),
  },
  {
    id: "cp2",
    exhibitionId: exhibition.id,
    sessionId: "seed",
    authorName: "준호",
    body: `${EV_D} 라운지 스탬프 다 모으면 에코백 추첨해요.`,
    boothId: id(EV_D),
    createdAt: at(12, 50),
  },
  {
    id: "cp3",
    exhibitionId: exhibition.id,
    sessionId: "seed",
    authorName: "익명",
    body: `${EV_B} 신간 굿즈 거의 다 나갔어요. 빨리 가보세요!`,
    boothId: id(EV_B),
    createdAt: at(15, 5),
  },
];

export function freshSeed() {
  return {
    exhibition: structuredClone(exhibition),
    halls: structuredClone(halls),
    categories: structuredClone(categories),
    booths: structuredClone(booths),
    events: structuredClone(events),
    welcomeKits: structuredClone(welcomeKits),
    reviews: structuredClone(reviews),
    communityPosts: structuredClone(communityPosts),
  };
}
