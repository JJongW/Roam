// 부스 상세의 "소개" — 로미 발화 한 줄 + 작가 본인의 말(인용).
//
// 왜 파생인가: seed의 longDescription이 순수 템플릿이라
// (`${name}의 부스입니다. 부스 번호 ${code}. … 참가 ${cat.name}입니다.`) 914개 부스가
// 사실상 같은 문장이었다. DB 컬럼을 고치면 마이그레이션이 필요하고 mock과도 갈리므로,
// valueTags처럼 **읽을 때 파생**한다.
//
// 왜 인용을 분리하는가: 로미는 반말인데 작가 소개문의 13%가 존댓말(`~입니다`)이다.
// 그 글은 **작가 본인이 쓴 것**이라 반말로 고치면 남의 말을 바꾸는 것이고, 그대로 쓰면
// 로미 목소리가 깨진다. 출처를 밝혀 인용하면 둘 다 지켜진다.
import { primaryThemeFromTags, themeLabel } from "@/lib/booth/themes";
import type { Booth } from "@/lib/types";

export interface BoothAbout {
  /** 로미가 이 부스를 한 줄로 소개하는 말(반말). 재료가 없으면 undefined. */
  romi?: string;
  /** 작가 본인이 쓴 소개 — 그대로 인용한다(존댓말이어도 고치지 않는다). */
  quote?: string;
  /** 파생할 재료가 아무것도 없을 때 쓰는 원문 폴백. */
  fallback?: string;
}

/**
 * 작가 소개 중 **내용이 있는 것만** 인용한다. 상당수는 부스코드·페어 일정·주소뿐이라
 * ("서일페 C01. 다섯번째 신상마켓 준비중.") 그대로 인용하면 정보가 아닌 걸 작가의 말인
 * 양 보여주게 된다. 상투구를 걷어낸 뒤 남는 게 없으면 인용하지 않는다.
 */
function meaningfulQuote(raw?: string): string | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  const residue = text
    // 페어 이름·회차는 소개가 아니다. 데이터에 실제로 나오는 표기들.
    .replace(/(서일페|부일페|케일페|일러스트레이션페어|페이퍼즈?클럽|페퍼클|닷닷닷)/gi, " ")
    .replace(/SIF\s*V?\.?\s*\d+/gi, " ")
    .replace(/[A-Z]-?\d{2}\b/g, " ") // 부스코드
    .replace(/\d{1,2}\s*[/.월]\s*\d{1,2}[일]?\s*[-~]?\s*\d*[/.월]?\s*\d*[일]?/g, " ")
    .replace(/\d{4}[.\-]\d{2}[.\-]\d{2}/g, " ")
    .replace(/[^가-힣a-zA-Z]/g, "")
    .trim();
  // 상투구를 뺀 실질 내용이 이 정도는 남아야 "작가가 자기를 소개한 말"이라 볼 수 있다.
  return residue.length >= 8 ? text : undefined;
}

/** 굿즈 개수를 사람 말로. 정확한 수를 알 때만 말한다. */
function goodsClause(count: number): string | null {
  if (count >= 8) return `굿즈 종류가 ${count}가지로 많아`;
  if (count >= 3) return `굿즈는 ${count}가지 정도 준비했어`;
  if (count > 0) return "굿즈도 조금 있어";
  return null;
}

/**
 * 부스에서 로미 발화와 작가 인용을 뽑는다. 순수·LLM 없음.
 * 지어내지 않는다 — 테마도 굿즈도 소개도 없으면 romi는 비고 fallback만 남는다.
 */
export function boothAbout(booth: Booth): BoothAbout {
  const themeKey = primaryThemeFromTags(booth.tags);
  const fine = booth.enrichment?.themeTags ?? [];
  const goods = booth.enrichment?.goodsKeywords ?? [];

  const parts: string[] = [];
  if (themeKey) {
    // 소분류가 있으면 더 구체적으로: "동물 — 고양이·반려동물 쪽이야"
    // 대분류와 같은 말인 소분류는 뺀다 — "문구·다꾸 중에서도 문구·다꾸 쪽이야"처럼
    // 같은 단어를 두 번 말하는 문장이 나온다.
    const label = themeLabel(themeKey);
    const detail = fine
      .filter((f) => f !== label)
      .slice(0, 2)
      .join("·");
    parts.push(
      detail ? `${label} 중에서도 ${detail} 쪽이야` : `${label} 쪽 부스야`,
    );
  }
  const g = goodsClause(goods.length);
  if (g) parts.push(g);

  const quote = meaningfulQuote(booth.enrichment?.summary);

  return {
    romi: parts.length > 0 ? `${parts.join(". ")}.` : undefined,
    quote,
    // 로미 발화도 인용도 못 만들 때만 원문을 쓴다(SIBF처럼 실제 소개가 있는 전시).
    fallback: parts.length === 0 && !quote ? booth.longDescription : undefined,
  };
}
