import type { Booth, Category, Hall } from "@/lib/types";
import type { FloorplanBooth } from "@/lib/floorplans";
import type { BoothEnrichmentAuthorInput } from "@/lib/schemas";
import type { IntakeBooth, IntakeFile } from "./schema";

/** 저작 6종 — upsertBoothEnrichment가 통째로 갈아끼우는 컬럼들. */
type Authored = BoothEnrichmentAuthorInput;

/** 새로 만들 부스. 홀·카테고리는 이름으로 남긴다 — 아직 id가 없을 수 있다. */
export interface PlannedCreate {
  code: string;
  name: string;
  company: string;
  hallName: string;
  categoryName: string;
  kind: "exhibitor" | "facility";
  description: string;
  longDescription: string;
  images: string[];
  logoUrl?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  tags: string[];
  x: number;
  y: number;
  enrichment?: Authored;
}

export interface PlannedFill {
  code: string;
  boothId: string;
  /** 부스 본체에 덧쓸 필드(빈 칸만). */
  boothPatch: Record<string, unknown>;
  /** 저작 6종은 컬럼을 통째로 갈아끼우므로 델타가 아니라 **병합된 최종값**이다. */
  enrichment?: Authored;
  /** 미리보기용 — 무엇이 채워지는지. */
  filledFields: string[];
}

export interface PlannedConflict {
  code: string;
  boothId: string;
  field: string;
  current: unknown;
  incoming: unknown;
}

export interface PlanError {
  code: string;
  message: string;
}

export interface IntakePlan {
  creates: PlannedCreate[];
  fills: PlannedFill[];
  conflicts: PlannedConflict[];
  errors: PlanError[];
  newHalls: string[];
  newCategories: { slug: string; name: string }[];
  warnings: string[];
  /** 파일에 있지만 바뀔 게 없는 부스 수. */
  unchanged: number;
}

export interface PlanInput {
  file: IntakeFile;
  booths: Booth[];
  halls: Hall[];
  categories: Category[];
  /** FLOORPLANS[slug]?.booths ?? [] — 좌표의 유일한 출처. */
  floorplanBooths: FloorplanBooth[];
  /** true면 충돌도 덮어쓴다. 기본은 안 쓰고 목록으로만 보여준다. */
  overwrite?: boolean;
}

const EMPTY_AUTHORED: Authored = {
  summary: "",
  roamInterpretation: "",
  sourceUrl: "",
  valueTags: [],
  recommendationReasons: {},
  thingsToDo: [],
  timing: [],
  memoryHooks: [],
};

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 부스 본체에서 인입이 건드리는 필드 — 이 목록 밖은 절대 안 건드린다. */
const BOOTH_FIELDS = [
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
] as const;

/**
 * 인입 파일과 현재 상태를 비교해 무엇을 만들고 무엇을 채울지 계산한다. 순수 —
 * DB도 네트워크도 안 탄다. 900부스짜리 파일도 여기서 다 검증된다.
 *
 * 규칙: 없는 code는 만들고, 있는 code는 **빈 필드만** 채운다. 양쪽에 값이 있고
 * 다르면 conflicts로 빼고 쓰지 않는다(overwrite 켜면 쓴다). 손으로 쓴 값이
 * 조용히 사라지면 안 되기 때문이다.
 */
export function planIntake(input: PlanInput): IntakePlan {
  const { file, booths, halls, categories, floorplanBooths } = input;
  const overwrite = input.overwrite ?? false;

  const boothByCode = new Map(
    booths.filter((b) => b.code).map((b) => [b.code as string, b]),
  );
  const geoByCode = new Map(floorplanBooths.map((f) => [f.code, f]));
  const hallNames = new Set(halls.map((h) => h.name));
  const categoryNames = new Set(categories.map((c) => c.name));
  const categorySlugs = new Set(categories.map((c) => c.slug));

  const plan: IntakePlan = {
    creates: [],
    fills: [],
    conflicts: [],
    errors: [],
    newHalls: [],
    newCategories: [],
    warnings: [],
    unchanged: 0,
  };

  const seen = new Set<string>();
  for (const row of file.booths) {
    if (seen.has(row.code)) {
      plan.errors.push({ code: row.code, message: "파일 안에서 code가 중복됩니다" });
      continue;
    }
    seen.add(row.code);

    const existing = boothByCode.get(row.code);
    if (existing) planFill(plan, row, existing, overwrite);
    else planCreate(plan, row, geoByCode, hallNames, categoryNames, categorySlugs);
  }
  return plan;
}

function planCreate(
  plan: IntakePlan,
  row: IntakeBooth,
  geoByCode: Map<string, FloorplanBooth>,
  hallNames: Set<string>,
  categoryNames: Set<string>,
  categorySlugs: Set<string>,
) {
  if (!row.name) {
    plan.errors.push({
      code: row.code,
      message: "새 부스인데 name이 없습니다 — 이름 없이는 만들 수 없습니다",
    });
    return;
  }
  // 홀·카테고리를 안 적었으면 기존 것이 정확히 하나일 때만 그걸 쓴다. 둘 이상인데
  // 임의로 고르면 부스가 엉뚱한 분야로 들어가고, "기타" 같은 걸 지어내면 없던
  // 카테고리가 조용히 생긴다. 어느 쪽도 나중에 눈으로 못 잡는다.
  const hallName = row.hall ?? (hallNames.size === 1 ? [...hallNames][0] : undefined);
  const categoryName =
    row.category ?? (categoryNames.size === 1 ? [...categoryNames][0] : undefined);
  if (!hallName) {
    plan.errors.push({ code: row.code, message: "hall을 적어야 합니다" });
    return;
  }
  if (!categoryName) {
    plan.errors.push({ code: row.code, message: "category를 적어야 합니다" });
    return;
  }
  if (!hallNames.has(hallName) && !plan.newHalls.includes(hallName)) {
    plan.newHalls.push(hallName);
  }
  if (
    !categoryNames.has(categoryName) &&
    !plan.newCategories.some((c) => c.name === categoryName)
  ) {
    // slug은 전역 unique이고 booth.tags에 그대로 들어가 스코어링이 읽는다 —
    // 한글 이름에서 파생하면 쓰레기가 되므로 파일이 명시해야 한다.
    if (!row.categorySlug) {
      plan.errors.push({
        code: row.code,
        message: `새 카테고리 "${categoryName}"에 categorySlug가 없습니다`,
      });
      return;
    }
    if (categorySlugs.has(row.categorySlug)) {
      plan.errors.push({
        code: row.code,
        message: `categorySlug "${row.categorySlug}"는 다른 카테고리가 이미 씁니다`,
      });
      return;
    }
    plan.newCategories.push({ slug: row.categorySlug, name: categoryName });
  }

  const geo = geoByCode.get(row.code);
  if (!geo) {
    plan.warnings.push(
      `${row.code}: 도면(FLOORPLANS)에 없는 코드 — 좌표 0,0으로 만듭니다`,
    );
  }

  plan.creates.push({
    code: row.code,
    name: row.name,
    company: row.company ?? row.name,
    hallName,
    categoryName,
    kind: row.kind ?? "exhibitor",
    description: row.description ?? "",
    longDescription: row.longDescription ?? "",
    images: row.images ?? [],
    logoUrl: row.logoUrl,
    instagramUrl: row.instagramUrl,
    websiteUrl: row.websiteUrl,
    tags: row.tags ?? [],
    x: geo?.x ?? 0,
    y: geo?.y ?? 0,
    enrichment: row.enrichment
      ? { ...EMPTY_AUTHORED, ...stripEmpty(row.enrichment) }
      : undefined,
  });
}

function stripEmpty(e: Partial<Authored>): Partial<Authored> {
  return Object.fromEntries(
    Object.entries(e).filter(([, v]) => !isEmpty(v)),
  ) as Partial<Authored>;
}

function planFill(
  plan: IntakePlan,
  row: IntakeBooth,
  existing: Booth,
  overwrite: boolean,
) {
  const boothPatch: Record<string, unknown> = {};
  const filledFields: string[] = [];

  for (const field of BOOTH_FIELDS) {
    const incoming = (row as Record<string, unknown>)[field];
    if (incoming === undefined || isEmpty(incoming)) continue;
    const current = (existing as unknown as Record<string, unknown>)[field];
    if (isEmpty(current)) {
      boothPatch[field] = incoming;
      filledFields.push(field);
    } else if (!same(current, incoming)) {
      plan.conflicts.push({
        code: row.code,
        boothId: existing.id,
        field,
        current,
        incoming,
      });
      if (overwrite) {
        boothPatch[field] = incoming;
        filledFields.push(field);
      }
    }
  }

  const enrichment = planEnrichment(plan, row, existing, overwrite, filledFields);

  if (filledFields.length === 0) {
    plan.unchanged += 1;
    return;
  }
  plan.fills.push({
    code: row.code,
    boothId: existing.id,
    boothPatch,
    enrichment,
    filledFields,
  });
}

/**
 * 저작 6종 병합. booth_enrichment는 컬럼을 통째로 덮어쓰므로 델타가 아니라
 * 최종값을 만들어 돌려준다 — 기존 값이 있으면 그게 이기고, 비어 있을 때만
 * 파일 값이 들어간다.
 *
 * 배열(thingsToDo·timing·memoryHooks·valueTags)은 합집합을 만들지 않는다.
 * 합치면 중복과 순서 뒤섞임이 조용히 생기고, 사람이 쓴 목록의 의도가 깨진다.
 * 기존이 비었으면 통째로 넣고, 차 있으면 충돌로 올린다.
 */
function planEnrichment(
  plan: IntakePlan,
  row: IntakeBooth,
  existing: Booth,
  overwrite: boolean,
  filledFields: string[],
): Authored | undefined {
  if (!row.enrichment) return undefined;
  const incoming = stripEmpty(row.enrichment);
  if (Object.keys(incoming).length === 0) return undefined;

  const cur = existing.enrichment;
  const merged: Authored = {
    summary: cur?.summary ?? "",
    roamInterpretation: cur?.roamInterpretation ?? "",
    sourceUrl: cur?.sourceUrl ?? "",
    valueTags: cur?.valueTags ?? [],
    recommendationReasons: cur?.recommendationReasons ?? {},
    thingsToDo: cur?.thingsToDo ?? [],
    timing: cur?.timing ?? [],
    memoryHooks: cur?.memoryHooks ?? [],
  };

  let touched = false;
  for (const [key, value] of Object.entries(incoming)) {
    const field = key as keyof Authored;
    if (field === "recommendationReasons") {
      // 여기만 키 단위로 병합한다 — 가치별로 독립적인 한 줄들이라
      // 하나가 비었다고 통째로 충돌 처리하면 나머지가 못 들어간다.
      const inc = value as Record<string, string>;
      for (const [slug, line] of Object.entries(inc)) {
        if (isEmpty(line)) continue;
        const currentLine = merged.recommendationReasons[slug];
        if (isEmpty(currentLine)) {
          merged.recommendationReasons[slug] = line;
          touched = true;
        } else if (currentLine !== line) {
          plan.conflicts.push({
            code: row.code,
            boothId: existing.id,
            field: `enrichment.recommendationReasons.${slug}`,
            current: currentLine,
            incoming: line,
          });
          if (overwrite) {
            merged.recommendationReasons[slug] = line;
            touched = true;
          }
        }
      }
      continue;
    }
    const currentValue = merged[field];
    if (isEmpty(currentValue)) {
      (merged as Record<string, unknown>)[field] = value;
      touched = true;
    } else if (!same(currentValue, value)) {
      plan.conflicts.push({
        code: row.code,
        boothId: existing.id,
        field: `enrichment.${field}`,
        current: currentValue,
        incoming: value,
      });
      if (overwrite) {
        (merged as Record<string, unknown>)[field] = value;
        touched = true;
      }
    }
  }

  if (!touched) return undefined;
  filledFields.push("enrichment");
  return merged;
}
