// 부스 화면이 보여 줄 브랜드 공식 소개(2026-11-03 Ted 결정). 순수 함수.
//
// 공식 소개는 브랜드에 하나만 둔다. 그 브랜드가 어느 박람회에 나오든 그 부스 화면에서
// 같은 소개를 보여 준다 — 박람회마다 소개를 새로 받지 않아도 되게.
// 보여 주는 건 원문이 아니라 Roam이 다시 쓴 소개(display), 그것도 publicValue를 통과한 것뿐이다
// (게이트 통과 collected, 또는 사람이 확인한 reviewed와 artist_confirmed).
//
// 부스 화면의 소개 우선순위(lib/booth/about.ts와 함께 읽는다):
//   1. 브랜드 공식 소개(이 함수)                — 박람회를 넘어 재사용, Roam 말투, 게이트 통과
//   2. 그 부스의 저작 요약(enrichment.summary) — 공개 자료를 정리한 글, 말투는 원문 그대로
//   3. 부스 원문 소개(longDescription)          — 말투를 고치지 않은 원문
// 브랜드 소개가 있으면 2와 3을 대신한다. 근거: 레포의 summary는 대부분 주최 소개와 공식 사이트를
// 정리한 초안이고(about.ts 주석, 2026-10-09), mock의 하우스 아카이브는 description과 summary가
// 같은 원문이다. 즉 2와 3은 1과 같은 종류의 설명 문장인데 말투를 고치지 않았다. "설명 문장은
// Roam 말투로"(2026-11-03 Ted 결정)를 지키는 건 게이트를 넘은 1뿐이다.
// 대가: 그 회차에만 맞는 말(이번 페어 신상품 등)이 2에 있으면 가려진다. 회차별 정보는
// 출전 칸(그 회차 품목과 신상품)과 이벤트가 맡는다.
import { BRAND_FIELDS, publicValue } from "@/lib/brands/profile";
import { tidyIntroText } from "@/lib/brands/intro-tidy";
import type { Repository } from "@/lib/repositories/types";
import type { ProfileField } from "@/lib/types";

/** 부스 화면용. 실패해도(0061 적용 전 등) 화면은 떠야 하니 null로 접는다. */
export async function brandIntroForBooth(repo: Repository, boothId: string): Promise<BrandIntro | null> {
  try {
    return brandIntroFromField(await repo.getBrandIntroFieldForBooth(boothId));
  } catch {
    return null;
  }
}

export interface BrandIntro {
  text: string;
  exhibitorId: string;
  /** 원문을 가져온 부스(같은 회차인지 화면이 알 수 있게). */
  sourceBoothId?: string;
}

const INTRO_DEF = BRAND_FIELDS.find((f) => f.key === "intro")!;

export function brandIntroFromField(field: ProfileField | undefined | null): BrandIntro | null {
  if (!field || !field.exhibitorId || field.field !== "intro") return null;
  const raw = publicValue(INTRO_DEF, field);
  if (typeof raw !== "string") return null;
  // 내보내기 직전에 한 번 더 정돈한다(2026-11-28). 저장된 변환본을 다시 만들기 전에도 인스타 아이디, 링크,
  // 문장 중간 줄바꿈이 화면(웹, iOS 같은 API)에 나가지 않게. 워커가 만든 변환본(collected)만 거친다 — 사람이 고친
  // 소개(reviewed)와 작가가 확인한 소개(artist_confirmed)는 쓴 그대로 둔다.
  const text = field.status === "collected" ? tidyIntroText(raw) : raw.trim();
  if (!text) return null;
  const src = field.sources.find((s) => s.startsWith("roam:booth/"));
  return { text, exhibitorId: field.exhibitorId, sourceBoothId: src?.slice("roam:booth/".length) };
}
