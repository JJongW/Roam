// 테스트 전용 세계. 실제 데이터 모양(brands.v1이 남기는 칸)을 따른다.
import type { BrandContactStatus, ExhibitorGraph, ProfileField, ProfileFieldStatus } from "@/lib/types";
import type { ExhibitionLite, World } from "./facts";

export const TODAY = "2026-11-19";

export const FAIRS: ExhibitionLite[] = [
  { id: "exh_ny", slug: "newyear-store-2026", name: "새해 준비상점", venue: "킨텍스 제2전시장 6홀", startDate: "2026-12-04", endDate: "2026-12-06" },
  { id: "exh_old", slug: "sif-2026", name: "서울일러스트레이션페어", venue: "코엑스", startDate: "2026-07-01", endDate: "2026-07-03" },
];

const INTRO_HACHI =
  "하치(HACHI)는 ‘하나의 치장’이라는 뜻을 담은 디자인 스튜디오로, 한국 전통 단청의 문양과 색채를 오늘의 감각으로 재해석합니다. 문양의 연구와 고증을 바탕으로 스카프·파우치 등 라이프스타일 제품을 개발합니다.";
const INTRO_GUSAN = "차가운 겨울 속 포근한 순간을 담아내었습니다. 소소한 일상에 아늑한 온기를 전할 수 있기를 바랍니다.";
const INTRO_LONG_A = "종이와 실로 계절을 기록하는 작은 문구 브랜드예요. 손으로 그린 그림을 엽서와 스티커로 만들어요.";
const INTRO_LONG_B = "매일 쓰는 다이어리 속지를 직접 디자인해서 만드는 1인 스튜디오입니다. 쓰는 사람의 하루가 편해지기를 바랍니다.";

export function field(
  exhibitorId: string,
  key: string,
  value: unknown,
  status: ProfileFieldStatus = "collected",
  sources = ["https://example.org/official"],
): ProfileField {
  return {
    id: `ex:${exhibitorId}:${key}`,
    exhibitorId,
    participantId: null,
    field: key,
    value,
    sources,
    status,
    verifiedAt: "2026-11-10T00:00:00Z",
    actor: null,
    createdAt: "2026-11-10T00:00:00Z",
    updatedAt: "2026-11-10T00:00:00Z",
  };
}

/** 사진 칸 값. 경로는 앱에서 열리는 "/…". scope는 사람이 붙인 허락 범위. */
export const photos = (slug: string, n = 3, scope = "작가가 보낸 사진, 새해 준비상점 아티클과 카드뉴스에만") =>
  Array.from({ length: n }, (_, i) => ({ path: `/articles/test/${slug}_${i + 1}.webp`, scope }));

/** 새해 준비상점 회차 사진 허락. 지난 회차(pt_gusan_old)엔 없다 — 허락은 회차마다 따로. */
export const PERMISSIONS: Record<string, { status: BrandContactStatus; allowedUse: string[] }> = {
  pt_hachi_ny: { status: "granted", allowedUse: ["sent-photo", "tag"] },
  pt_gusan_ny: { status: "granted", allowedUse: ["account-photo"] },
  pt_paper_ny: { status: "partial", allowedUse: ["sent-photo"] },
  pt_diary_ny: { status: "granted", allowedUse: ["account-photo", "text"] },
  pt_draft_ny: { status: "granted", allowedUse: ["account-photo"] },
};

export function world(over: Partial<World> = {}): World {
  const graph: ExhibitorGraph = {
    exhibitors: [
      { id: "ex_hachi", canonicalName: "하치", aliases: ["HACHI"] },
      { id: "ex_gusan", canonicalName: "구산", aliases: ["9SAN93"] },
      { id: "ex_paper", canonicalName: "종이달" },
      { id: "ex_diary", canonicalName: "하루속지" },
      { id: "ex_draft", canonicalName: "초안만" },
    ],
    participants: [
      { id: "pt_hachi_ny", exhibitorId: "ex_hachi", exhibitionId: "exh_ny", displayName: "하치" },
      { id: "pt_gusan_ny", exhibitorId: "ex_gusan", exhibitionId: "exh_ny", displayName: "구산" },
      { id: "pt_gusan_old", exhibitorId: "ex_gusan", exhibitionId: "exh_old", displayName: "구산" },
      { id: "pt_paper_ny", exhibitorId: "ex_paper", exhibitionId: "exh_ny", displayName: "종이달" },
      { id: "pt_diary_ny", exhibitorId: "ex_diary", exhibitionId: "exh_ny", displayName: "하루속지" },
      { id: "pt_draft_ny", exhibitorId: "ex_draft", exhibitionId: "exh_ny", displayName: "초안만" },
    ],
    assignments: [],
    candidates: [],
  };
  const fields: ProfileField[] = [
    field("ex_hachi", "intro", { original: INTRO_HACHI }),
    field("ex_gusan", "intro", { original: INTRO_GUSAN }, "artist_confirmed", ["인스타 DM으로 작가가 직접 보낸 소개"]),
    field("ex_paper", "intro", { original: INTRO_LONG_A }),
    field("ex_paper", "items", ["엽서", "스티커"], "reviewed"),
    field("ex_diary", "intro", { original: INTRO_LONG_B }),
    field("ex_hachi", "photos", photos("hachi"), "reviewed", ["인스타 DM으로 작가가 보낸 사진"]),
    field("ex_gusan", "photos", photos("gusan", 1), "artist_confirmed", ["인스타 DM으로 작가가 보낸 사진"]),
    field("ex_paper", "photos", photos("paper", 2), "reviewed"),
    field("ex_diary", "photos", photos("diary", 1), "reviewed"),
    // 명단 가져오기가 채운 주최 측 공개 사진(collected)은 작가 허락이 아니라 쓰지 않는다.
    field("ex_draft", "photos", photos("draft", 2, "주최 측 사이트 공개 사진"), "collected"),
    // AI 초안은 사실로 쓰지 않는다.
    field("ex_draft", "intro", { original: "AI가 짐작해서 쓴 소개 문장이에요. 이건 아티클에 쓰면 안 돼요. 길이를 채우려고 더 적어요." }, "ai_draft"),
  ];
  return { today: TODAY, exhibitions: FAIRS, graph, fields, permissions: PERMISSIONS, ...over };
}
