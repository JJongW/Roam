import { z } from "zod";
import type { Category, CompanionType, MovementPreference, VisitPurpose } from "@/lib/types";
import type { UserPreferenceInput } from "@/lib/schemas";

/** Raw AI parse target — loose, then mapped onto the app's strict preference. */
export const aiRoutePreferencesSchema = z.object({
  purpose: z
    .enum(["purchase", "information", "networking", "experience", "general"])
    .optional(),
  interests: z.array(z.string()).default([]),
  durationMinutes: z.number().optional(),
  companion: z
    .enum(["solo", "couple_friend", "family", "group", "business"])
    .optional(),
  movementStyle: z.enum(["shortest", "balanced", "thorough"]).optional(),
  avoidCrowds: z.boolean().optional(),
  preferredBoothNamesOrIds: z.array(z.string()).default([]),
  avoidBoothNamesOrIds: z.array(z.string()).default([]),
  startArea: z.string().optional(),
  constraints: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0.5),
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

  const purpose: VisitPurpose =
    ai.purpose && ai.purpose !== "general"
      ? (ai.purpose as VisitPurpose)
      : "experience";

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
    visitPurpose: purpose,
    interests,
    availableMinutes,
    movementPreference: movement,
    companionType: companion,
  };

  const chips: string[] = [];
  for (const slug of interests) chips.push(bySlug.get(slug)?.name ?? slug);
  chips.push(`${snapDuration(availableMinutes)}분`);
  if (ai.avoidCrowds) chips.push("대기 적은 곳");
  if (ai.startArea) chips.push(`${ai.startArea} 근처`);

  return { preference, chips, unmatched };
}

/** Build the parsing prompt with the real category vocabulary injected. */
export function buildPreferencePrompt(text: string, categories: Category[]): string {
  const cats = categories.map((c) => `${c.slug} (${c.name})`).join(", ");
  return [
    "너는 전시회 관람 동선 추천 도우미야. 방문객의 한국어 요청을 읽고,",
    "아래 JSON 스키마에 맞는 객체 하나만 출력해. 설명/마크다운 금지, JSON만.",
    "",
    `사용 가능한 관심 분야(반드시 이 slug 중에서만 interests에 넣어): ${cats}`,
    "",
    "규칙:",
    "- interests: 요청에 맞는 분야 slug 배열. 없으면 빈 배열.",
    "- durationMinutes: 언급된 시간을 분으로(예: '1시간'→60, '30분'→30). 없으면 생략.",
    "- avoidCrowds: '사람 많은 곳 피하고 싶어' 등 혼잡 회피 의도면 true.",
    "- movementStyle: 빠르게/효율→shortest, 꼼꼼히/많이→thorough, 기본→balanced.",
    "- companion: 혼자→solo, 연인/친구→couple_friend, 가족/아이→family, 단체→group, 업무→business.",
    "- purpose: 구매→purchase, 정보→information, 교류→networking, 체험→experience, 그 외→general.",
    "- startArea: 'B홀 근처' 같은 시작 위치 언급이 있으면 그 문자열.",
    "- preferredBoothNamesOrIds / avoidBoothNamesOrIds: 특정 부스/브랜드 언급 시.",
    "- constraints: 매핑 못 한 기타 조건 문장.",
    "- confidence: 0~1, 요청을 얼마나 확실히 이해했는지.",
    "",
    `방문객 요청: "${text}"`,
  ].join("\n");
}
