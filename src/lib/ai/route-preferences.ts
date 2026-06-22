import { z } from "zod";
import type {
  Category,
  CompanionType,
  MovementPreference,
  VisitPurpose,
} from "@/lib/types";
import type { UserPreferenceInput } from "@/lib/schemas";

/** Models emit a bare string, null, or an array here — coerce to a string[]. */
const stringList = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) =>
    v == null ? [] : Array.isArray(v) ? v : v.trim() ? [v.trim()] : [],
  );

/** Raw AI parse target — loose, then mapped onto the app's strict preference. */
const purposeList = z
  .union([z.string(), z.array(z.string())])
  .nullish()
  .transform((v) => (v == null ? [] : Array.isArray(v) ? v : [v]))
  .pipe(
    z.array(
      z
        .enum([
          "purchase",
          "information",
          "networking",
          "experience",
          "general",
        ])
        .catch("general"),
    ),
  );

export const aiRoutePreferencesSchema = z.object({
  // One or more goals — the visitor can have several (e.g. 구매 + 체험).
  purposes: purposeList,
  interests: stringList,
  durationMinutes: z.coerce.number().optional().catch(undefined),
  companion: z
    .enum(["solo", "couple_friend", "family", "group", "business"])
    .optional()
    .catch(undefined),
  movementStyle: z
    .enum(["shortest", "balanced", "thorough"])
    .optional()
    .catch(undefined),
  avoidCrowds: z.boolean().optional().catch(undefined),
  preferredBoothNamesOrIds: stringList,
  avoidBoothNamesOrIds: stringList,
  startArea: z.string().optional().catch(undefined),
  constraints: stringList,
  confidence: z.coerce.number().min(0).max(1).catch(0.5).default(0.5),
});

export type AiRoutePreferences = z.infer<typeof aiRoutePreferencesSchema>;

const COMPANION_MAP: Record<string, CompanionType> = {
  solo: "alone",
  couple_friend: "partner",
  family: "family",
  group: "group",
  business: "business",
};

const TIME_PRESETS = [60, 120, 180, 240] as const;

/** Snap an arbitrary duration to the nearest supported preset (for chips). */
function snapDuration(min: number): number {
  return TIME_PRESETS.reduce((best, p) =>
    Math.abs(p - min) < Math.abs(best - min) ? p : best,
  );
}

export interface MappedPreference {
  preference: UserPreferenceInput;
  /** Human-readable "이렇게 이해했어요" chips. */
  chips: string[];
  /** Terms the AI couldn't map to a real category/booth. */
  unmatched: string[];
}

/**
 * Turn the loose AI parse into the app's strict preference, mapping Korean
 * interest words onto real category slugs and clamping to supported values.
 * Always yields a valid, usable preference (sensible defaults) even on a weak
 * parse — the route page lets the visitor refine afterwards.
 */
export function mapToPreference(
  ai: AiRoutePreferences,
  categories: Category[],
): MappedPreference {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const byName = new Map(categories.map((c) => [c.name, c]));

  const matched: string[] = [];
  const unmatched: string[] = [];
  for (const raw of ai.interests) {
    const t = raw.trim();
    const cat = bySlug.get(t) ?? byName.get(t);
    if (cat) matched.push(cat.slug);
    else unmatched.push(t);
  }
  const interests = matched.length
    ? Array.from(new Set(matched))
    : // No category matched → broad default so the route isn't empty.
      categories.slice(0, Math.min(3, categories.length)).map((c) => c.slug);

  // Keep every concrete goal (drop "general"); fall back to experience if none.
  const visitPurposes: VisitPurpose[] = Array.from(
    new Set(ai.purposes.filter((p): p is VisitPurpose => p !== "general")),
  );
  if (visitPurposes.length === 0) visitPurposes.push("experience");

  const availableMinutes = Math.min(
    600,
    Math.max(30, Math.round(ai.durationMinutes ?? 120)),
  );

  const movement: MovementPreference =
    ai.movementStyle ?? (ai.avoidCrowds ? "balanced" : "balanced");

  const companion: CompanionType = ai.companion
    ? (COMPANION_MAP[ai.companion] ?? "alone")
    : "alone";

  const preference: UserPreferenceInput = {
    visitPurposes,
    interests,
    availableMinutes,
    movementPreference: movement,
    companionType: companion,
  };

  const chips: string[] = [];
  for (const slug of interests) chips.push(bySlug.get(slug)?.name ?? slug);
  chips.push(`${snapDuration(availableMinutes)}분`);
  if (ai.avoidCrowds) chips.push("대기 적은 곳");
  if (ai.startArea) {
    const area = ai.startArea.trim().replace(/\s*근처$/, "");
    chips.push(`${area} 근처`);
  }

  return { preference, chips, unmatched };
}

/** Build the parsing prompt with the real category vocabulary injected. */
export function buildPreferencePrompt(
  text: string,
  categories: Category[],
): string {
  const cats = categories.map((c) => `${c.slug} (${c.name})`).join(", ");
  return [
    "너는 도서전 관람 동선 추천 도우미야. 방문객이 자유롭게 적은 한국어 소개를 읽어.",
    "방문객이 '어떤 사람인지(직업·상황)', '무엇에 관심 있는지', '왜 왔는지(방문 동기)'를",
    "담아 적을 수 있어. 그 맥락에서 선호를 추론해, 아래 JSON 스키마 객체 하나만 출력해.",
    "설명/마크다운 금지, JSON만.",
    "",
    `사용 가능한 관심 분야(반드시 이 slug 중에서만 interests에 넣어): ${cats}`,
    "",
    "규칙:",
    "- interests: 관심사·직업·방문 동기에서 가장 맞는 분야 slug 배열. 없으면 빈 배열.",
    "  (예: '디자인 일' → art, '아이랑 그림책' → 아동/그림책 분야)",
    "- companion/purpose: 페르소나 단서에서 추론(직장인 점심→solo·짧게, 부모·아이→family).",
    "- durationMinutes: 언급된 시간을 분으로(예: '1시간'→60, '30분'→30). 없으면 생략.",
    "- avoidCrowds: '사람 많은 곳 피하고 싶어' 등 혼잡 회피 의도면 true.",
    "- movementStyle: 빠르게/효율→shortest, 꼼꼼히/많이→thorough, 기본→balanced.",
    "- companion: 혼자→solo, 연인/친구→couple_friend, 가족/아이→family, 단체→group, 업무→business.",
    "- purposes: 방문 목적 배열(여러 개 가능). 구매→purchase, 정보→information, 교류→networking, 체험→experience, 그 외→general. 해당되는 것 모두 넣어.",
    "- startArea: 'B홀 근처' 같은 시작 위치 언급이 있으면 그 문자열.",
    "- preferredBoothNamesOrIds / avoidBoothNamesOrIds: 특정 부스/브랜드 언급 시.",
    "- constraints: 매핑 못 한 기타 조건 문장.",
    "- confidence: 0~1, 요청을 얼마나 확실히 이해했는지.",
    "",
    `방문객 요청: "${text}"`,
  ].join("\n");
}
