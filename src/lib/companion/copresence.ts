// 관람 중(현장·지도) 발화 조립 — 순수·LLM 없음. 관람 전(피드) 발화는 reaction-line.ts가
// 맡고, 이 파일은 부스 선택·미방문 이탈·검색 같은 현장 트리거를 다룬다.
//
// 한 줄이 두 일을 한다: 기억(과거 긍정 반응 겹침) + 사실(cue: 실제 이벤트/타이밍)을
// 가능하면 결합한다. 우선순위는 사실 > 기억 — 실제로 확인 가능한 사실이 더 신뢰를
// 준다. 둘 다 없으면 null(침묵) — 억지 발화 금지는 grounding.ts·curate.ts와 같은 원칙.
//
// 가치 이름은 쓰지 않는다 — 카테고리 라벨(분야)만 발화에 얹는다. reaction-line.ts의
// "매칭 축(가치 slug) vs 발화 축(카테고리 라벨) 분리" 규약을 그대로 따른다.
import { boothValueSlugs } from "@/lib/values";
import type { Booth } from "@/lib/types";
import type { TFn } from "@/lib/i18n/resolve";

export interface CopresencePositive {
  booth: Booth;
  kind: "must" | "curious" | "good";
}

export type CopresenceInput =
  | {
      trigger: "select";
      booth: Booth;
      /** 과거 긍정 반응(자기 자신 제외 필요 없음 — 이 함수가 필터한다). */
      positives: CopresencePositive[];
      /** 실제 사실(임박 이벤트/타이밍) — deriveCue 결과. */
      cue?: string;
    }
  | { trigger: "unvisitedMust"; boothName: string }
  | {
      trigger: "searchHit";
      booth: Booth;
      positives: CopresencePositive[];
      /** 검색 결과 부스의 분야 라벨 — 가치 이름 아님. */
      categoryLabel?: string;
    };

/** positives 중 booth와 가치가 겹치는 첫 항목(자기 자신 제외). 없으면 undefined. */
function findMemoryMatch(
  booth: Booth,
  positives: CopresencePositive[],
): CopresencePositive | undefined {
  const vals = new Set(boothValueSlugs(booth));
  return positives.find(
    (p) =>
      p.booth.id !== booth.id &&
      boothValueSlugs(p.booth).some((v) => vals.has(v)),
  );
}

export function buildCopresenceLine(input: CopresenceInput, t: TFn): string | null {
  if (input.trigger === "unvisitedMust") {
    return t("companion.copresenceUnvisitedMust", { booth: input.boothName });
  }

  if (input.trigger === "searchHit") {
    const memory = findMemoryMatch(input.booth, input.positives);
    if (!memory || !input.categoryLabel) return null;
    return t("companion.copresenceSearchHit", {
      booth: input.booth.name,
      theme: input.categoryLabel,
    });
  }

  // trigger === "select" — 기억 + 사실을 우선순위대로 결합.
  const memory = findMemoryMatch(input.booth, input.positives);
  const cue = input.cue;
  if (memory && cue) {
    return t("companion.copresenceMemoryAndCue", { booth: memory.booth.name, cue });
  }
  if (cue) {
    return t("companion.copresenceCue", { cue });
  }
  if (memory) {
    return t("companion.copresenceMemory", { booth: memory.booth.name });
  }
  return null;
}
