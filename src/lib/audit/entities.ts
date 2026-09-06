import type { AuditEntity } from "./diff";

/**
 * 엔티티별로 "이력에 담을 필드"와 "빈 값이 뭔지". 새 엔티티를 붙일 때 이 표에만
 * 한 줄 추가하면 diff·되돌리기가 같이 따라온다.
 */
interface EntitySpec {
  fields: readonly string[];
  emptyFor: (field: string) => unknown;
}

const LIST_FIELDS = new Set([
  "valueTags",
  "thingsToDo",
  "timing",
  "memoryHooks",
  "images",
  "tags",
  "aliases",
]);
const MAP_FIELDS = new Set(["recommendationReasons"]);

function emptyByShape(field: string): unknown {
  if (MAP_FIELDS.has(field)) return {};
  if (LIST_FIELDS.has(field)) return [];
  return "";
}

export const AUDIT_SPECS: Record<AuditEntity, EntitySpec> = {
  // upsertBoothEnrichment가 실제로 갈아끼우는 저작 필드들.
  booth_enrichment: {
    fields: [
      "summary",
      "roamInterpretation",
      "sourceUrl",
      "valueTags",
      "recommendationReasons",
      "thingsToDo",
      "timing",
      "memoryHooks",
    ],
    emptyFor: emptyByShape,
  },
  // 인입·admin이 바꾸는 부스 본체. 좌표(x·y)는 도면이 진실이라 뺀다.
  booth: {
    fields: [
      "name",
      "company",
      "description",
      "longDescription",
      "images",
      "logoUrl",
      "instagramUrl",
      "websiteUrl",
      "tags",
      "aliases",
      "kind",
    ],
    emptyFor: emptyByShape,
  },
  exhibition: {
    fields: ["name", "venue", "description", "startDate", "endDate", "tips"],
    emptyFor: emptyByShape,
  },
  event: {
    fields: ["title", "description", "startTime", "endTime", "rewardInfo"],
    emptyFor: emptyByShape,
  },
};
