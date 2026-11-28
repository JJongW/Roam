// 브랜드 프로필 AI 초안 — 워커 잡 `brand_profile_draft`의 본체(설계: 2단계 보고서 8장,
// 기준 문서 brand-profile-spec 6장 ③ ~ ④). 브랜드 하나씩 돈다.
//
// 1. 결정적으로 모으는 칸(collected): 링크, 다른 이름 — LLM 없음.
// 2. 공식 소개(intro): 원문은 그대로 두고 LLM이 Roam 말투의 짧은 소개로 다시 쓴다 → 정돈(intro-tidy.ts) →
//    결정적 게이트(tone-gate.ts). 2026-11-28 전에는 말투만 바꿨다.
//    통과하면 collected, 못 넘으면 ai_draft(검수 큐).
// 3. AI 초안 칸(ai_draft): 정체 한 줄, 품목, 대표 작품, 어떤 결인가. 주어진 자료만 근거로,
//    칸마다 자료 id(출처)를 반드시 낸다. 출처 없는 칸은 버린다.
//
// 덮어쓰기: 빈 칸, stale, ai_draft만 쓴다(workerMayWrite). 사람이 확인한 칸과 이미 모은
// 공식 자료는 건드리지 않는다. 인스타그램은 읽지 않는다(Roam 규칙). 판매 페이지 자동
// 읽기는 꺼 두고 시작한다(2026-11-03 Ted 결정).
//
// LLM은 의존성으로 받는다 — 테스트는 목을 넣고, 워커는 Gemini(thinkingBudget 0)를 넣는다.
//
// 판단 기준(프롬프트)은 이 파일에 둔다(2026-11-03 결정, 근거):
//  - 워커는 Roam 레포(Roam-worker 실행본)만 가지고 돈다. Roam-design 문서를 런타임에 읽으면
//    레포 경계를 넘는 파일 의존이 생기고, 그 문서가 바뀌면 배포 없이 워커 행동이 바뀐다.
//  - 프롬프트는 칸 key, 품목과 결 목록(profile.ts), 게이트(tone-gate.ts)와 맞물린다. 같은
//    파일에 있어야 테스트가 같이 잡는다(draft.test.ts가 규칙 문구를 검사한다).
//  - 부스 초안기(lib/enrichment/draft-prompt.ts)도 프롬프트를 코드에 둔다. 같은 관례.
// 원본 규칙: Roam-design docs/brand/00_brand-rules.md, 02_voice-tone.md,
// docs/content/engine/brand-profile-spec.md. 그쪽이 바뀌면 여기와 테스트를 같이 고친다.
import { z } from "zod";
import { anchorKey } from "@/lib/exhibitor/identity";
import { hasRealBlurb } from "@/lib/booth/blurb";
import { checkToneConversion, type GateResult } from "@/lib/brands/tone-gate";
import { INTRO_MAX_PARAGRAPH_CHARS, INTRO_TARGET_CHARS, tidyIntroText } from "@/lib/brands/intro-tidy";
import { brandFieldLessons, lessonLines } from "@/lib/brands/lessons";
import {
  AI_DRAFT_FIELDS,
  FIELD_STATUS_LABEL,
  IDENTITY_BASIS_FIELDS,
  ITEM_OPTIONS,
  TEXTURE_OPTIONS,
  introNeedsTone,
  parseFieldValue,
  workerMayWrite,
} from "@/lib/brands/profile";
import type { Repository } from "@/lib/repositories/types";
import type { Booth, ProfileField } from "@/lib/types";

export const DRAFT_ACTOR = "worker:brand-profile-draft";

/** 자동으로 읽지 않는 곳 — 인스타(금지), 판매 페이지(Ted 결정 전까지 끔). */
const BLOCKED_HOSTS = [
  "instagram.com",
  "threads.net",
  "smartstore.naver.com",
  "brand.naver.com",
  "witchform.com",
  "marpple.shop",
  "idus.com",
  "29cm.co.kr",
  "coupang.com",
  "tumblbug.com",
];

export function mayFetch(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase();
    return !BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export interface Material {
  /** 출처로 그대로 저장되는 id — `roam:booth/<id>`나 URL. */
  id: string;
  text: string;
}

export interface DraftDeps {
  /** AI 초안 칸. 자료와 지침을 받아 JSON을 돌려준다. */
  draftFields?: (input: { system: string; prompt: string }) => Promise<unknown>;
  /** 소개 다시 쓰기. 원문을 받아 Roam 소개를 돌려준다. feedback이 있으면 지난 결과와 게이트가 짚은 점을 고쳐 다시 쓴다. */
  convertTone?: (input: ConvertToneInput) => Promise<string>;
  /** 공개 페이지 본문(글자만). 못 읽으면 null. */
  fetchText?: (url: string) => Promise<string | null>;
}

export interface ConvertToneInput {
  original: string;
  protectedTerms: string[];
  /** 주어로 쓸 브랜드 이름. 없으면 모델이 "Roam은"처럼 화자를 주어로 쓴다(2026-11-28 표본에서 실제로 나옴). */
  brandName?: string;
  /** 이 브랜드가 나온 행사 이름. 게이트가 소개 안의 행사 이름을 거른다. 모델에는 넘기지 않는다. */
  fairNames?: string[];
  /** 한 번 더 쓸 때: 지난 결과와 게이트가 짚은 점. */
  feedback?: { display: string; issues: string[] };
}

export interface DraftResult {
  exhibitorId: string;
  written: { field: string; status: string }[];
  skipped: { field: string; reason: string }[];
  gate: { ok: boolean; issues: string[] } | null;
  usedLlm: boolean;
}

const draftOutputSchema = z.object({
  fields: z
    .array(z.object({ field: z.string(), value: z.unknown(), sources: z.array(z.string()).default([]) }))
    .max(10),
});

/**
 * 공식 소개 → Roam 소개(display) 지침. 2026-11-28 Ted 요청으로 "말투만 바꾸기"에서 "Roam이 브랜드를 소개하는
 * 짧은 글"로 바꿨다(docs/decisions/2026-11-28_브랜드-소개-정돈.md). 원문은 intro.original에 그대로 남는다.
 * 숫자는 intro-tidy.ts의 상수와 맞춘다. 게이트(tone-gate.ts)가 같은 규칙을 결정적으로 다시 본다.
 */
export const TONE_SYSTEM = [
  "너는 Roam의 브랜드 소개 정리 담당이다. 브랜드가 쓴 공식 소개 원문을 읽고, Roam이 박람회 방문객에게 이 브랜드를 소개하는 짧은 글로 다시 쓴다.",
  "규칙:",
  "- 원문에 적힌 사실만 쓴다. 원문에 없는 내용, 칭찬, 과장, 단정(최고, 유일, 꼭, 무조건 등)을 넣지 않는다. 원문보다 확신을 크게 말하지 않는다.",
  "- 모든 문장을 해요체(~해요, ~예요, ~이에요)로 끝낸다. 원문이 합니다체(~습니다, ~입니다, ~바랍니다)여도 해요체로 바꾼다. 반말을 섞지 않는다.",
  "- 글의 화자는 Roam이다. 브랜드의 1인칭(저, 제, 저희)과 방문객을 부르는 말(여러분, 당신, 방문객)을 쓰지 않는다. 브랜드 이름을 주어로 쓰거나 주어를 뺀다.",
  "- 인스타그램 아이디(@로 시작하는 말), 링크와 웹 주소, 메일 주소, 해시태그(#), 이모지, 꾸밈 기호를 넣지 않는다. 팔로우나 문의 안내 문장도 뺀다.",
  "- 부스 번호, 날짜, 장소, \"이번 행사\"나 행사 이름처럼 한 회차에만 맞는 안내는 넣지 않는다. 이 소개는 다른 박람회 부스 화면에도 그대로 나간다.",
  "- 방문객에게 무엇을 하라고 권하지 않는다(~해 보세요, ~하세요, ~오세요로 끝내지 않는다). 사실을 말하고 고르는 건 방문객에게 둔다.",
  '- "전시", "전시회", "전시장"을 쓰지 않는다. 행사를 가리키면 박람회, 페어, 행사로 바꾼다. 작업 분야(예: 인쇄물, 웹, 전시 디자인)처럼 행사가 아닌 뜻이면 박람회로 바꾸지 말고 그 낱말을 뺀다. 원문 고유명사(행사명, 장소명) 안의 말은 그대로 둔다.',
  '- "드려요", "드릴게요"를 쓰지 않는다. Roam이 해 주는 일로 읽힌다. 브랜드가 하는 일로 쓴다(예: 이야기를 전해요).',
  "- 가운뎃점(·)을 쓰지 않는다. 쉼표나 와, 과로 바꾼다.",
  "- 영문 표기, 브랜드 이름, 작가 이름, 품목 이름은 원문 표기 그대로 쓴다. 숫자는 원문에 있는 것만 쓴다.",
  `- 형식: 문단 2~3개, 문단마다 1~2문장, 문단 하나는 ${INTRO_MAX_PARAGRAPH_CHARS}자 안, 전체 ${INTRO_TARGET_CHARS}자 안. 문단 사이에는 빈 줄 하나를 두고, 문단 안에서는 줄을 바꾸지 않는다. 원문이 짧으면 한 문단도 괜찮다.`,
  "- 문장을 \"~기를 바라요\", \"~길 바라요\"로 끝내지 않는다. Roam이 바라는 말로 읽힌다. 원문에 브랜드의 바람이 있으면 브랜드가 주어인 사실로 쓴다(예: 하치는 전통이 일상에 스미기를 바라는 마음으로 만들어요).",
  "- 받침 있는 말 뒤에는 \"이에요\", 받침 없는 말 뒤에는 \"예요\"를 쓴다(공방이에요, 브랜드예요, 고양이예요).",
  "- 첫 문단은 누가 무엇을 만드는지, 다음 문단은 작업 방식이나 품목, 마지막 문단은 원문에 있을 때만 작업에 담은 마음을 쓴다.",
  "- 바꾼 글만 출력한다. 제목, 따옴표, 설명을 붙이지 않는다.",
].join("\n");

/**
 * 소개를 다시 쓰고 정돈해 게이트에 넣는다. 못 넘으면 게이트가 짚은 점을 붙여 **한 번만** 더 쓴다(모델 호출 최대 2번).
 * 통과 여부는 여전히 게이트가 정한다 — 두 번째도 못 넘으면 그 결과가 ai_draft로 남는다.
 * 근거: 2026-11-28 새해 준비상점 표본 30곳에서 한 번에 넘은 게 9곳뿐이었다(합니다체가 남거나 길이를 넘김).
 */
export async function rewriteIntro(
  convert: NonNullable<DraftDeps["convertTone"]>,
  input: Omit<ConvertToneInput, "feedback">,
): Promise<{ display: string; gate: GateResult; tries: number }> {
  const once = async (feedback?: ConvertToneInput["feedback"]) => {
    const display = tidyIntroText(await convert({ ...input, feedback }));
    const gate = checkToneConversion({ mode: "intro", original: input.original, display, protectedTerms: input.protectedTerms, fairNames: input.fairNames });
    return { display, gate };
  };
  const first = await once();
  if (first.gate.ok) return { ...first, tries: 1 };
  const second = await once({ display: first.display, issues: first.gate.issues });
  return { ...(second.gate.ok || second.gate.issues.length <= first.gate.issues.length ? second : first), tries: 2 };
}

export function draftSystemPrompt(lessons: string[]): string {
  return [
    "너는 Roam의 브랜드 프로필 초안 담당이다. 아래 자료에 적힌 것만 근거로 칸을 채운다.",
    "규칙:",
    "- 자료에 없는 내용은 쓰지 않는다. 확인이 안 되는 칸은 내지 않는다.",
    "- 칸마다 근거가 된 자료 id를 sources에 적는다. sources가 빈 칸은 버려진다.",
    `- items는 다음 목록 안에서만 고른다: ${ITEM_OPTIONS.join(", ")}`,
    `- texture.tags는 다음 목록 안에서만 고른다: ${TEXTURE_OPTIONS.join(", ")}. note는 한 줄(120자 안), 해요체`,
    "- identityLine은 누가 무엇을 만드는지 한 문장, 60자 안, 해요체. 품목이나 결, 소개 같은 근거가 없으면 내지 않는다.",
    "- signatureWorks는 자료에 이름이 나온 캐릭터나 대표 상품만.",
    '- "전시"라는 말과 가운뎃점(·)을 쓰지 않는다. 과장, 단정을 쓰지 않는다.',
    '출력: {"fields":[{"field":"items","value":["스티커"],"sources":["roam:booth/..."]}]}',
    ...(lessons.length ? ["", "지난 검수에서 배운 것:", ...lessons.map((l) => `- ${l}`)] : []),
  ].join("\n");
}

export function draftUserPrompt(brand: { name: string; artistName?: string }, materials: Material[]): string {
  return [
    `브랜드: ${brand.name}${brand.artistName ? ` (작가 ${brand.artistName})` : ""}`,
    `채울 칸: ${AI_DRAFT_FIELDS.join(", ")}`,
    "자료:",
    ...materials.map((m) => `[${m.id}]\n${m.text}`),
  ].join("\n\n");
}

function boothMaterial(b: Booth): Material | null {
  const own = { name: b.name, code: b.code, company: b.company };
  const parts: string[] = [`부스 이름: ${b.name}`];
  // 시드가 합성한 소개(이름과 번호를 문장으로 옮긴 것)는 자료가 아니다(booth/blurb.ts).
  if (hasRealBlurb(b.description, own)) parts.push(`공식 소개: ${b.description}`);
  if (b.longDescription && b.longDescription !== b.description && hasRealBlurb(b.longDescription, own))
    parts.push(`공식 상세: ${b.longDescription}`);
  const goods = b.enrichment?.goodsKeywords ?? [];
  if (goods.length) parts.push(`운영자가 옮겨 적은 품목: ${goods.join(", ")}`);
  return parts.length > 1 ? { id: `roam:booth/${b.id}`, text: parts.join("\n") } : null;
}

/** 공식 소개 원문 — 가장 최근 회차의 실제 소개(합성 아님). */
export function pickIntro(booths: Booth[]): { text: string; source: string } | null {
  for (const b of booths) {
    const own = { name: b.name, code: b.code, company: b.company };
    if (hasRealBlurb(b.description, own)) return { text: b.description.trim(), source: `roam:booth/${b.id}` };
  }
  return null;
}

/** 읽고 쓰는 사이에 그 칸이 바뀌어서 쓰지 않았을 때. */
export const CHANGED_REASON = "초안을 쓰는 사이에 칸이 바뀌어서 건드리지 않았어요";

export async function runBrandProfileDraft(
  repo: Repository,
  exhibitorId: string,
  deps: DraftDeps,
): Promise<DraftResult | { error: string }> {
  const graph = await repo.loadExhibitorGraph();
  const exhibitor = graph.exhibitors.find((e) => e.id === exhibitorId);
  if (!exhibitor) return { error: `브랜드를 찾을 수 없어요: ${exhibitorId}` };

  // 그 브랜드의 출전 부스들(대표 배정만), 최근 회차 먼저.
  const participants = graph.participants.filter((p) => p.exhibitorId === exhibitorId);
  const pIds = new Set(participants.map((p) => p.id));
  const boothIds = new Set(graph.assignments.filter((a) => a.role === "primary" && pIds.has(a.participantId)).map((a) => a.boothId));
  const exhibitions = (await repo.listExhibitions({ limit: 500 })).data;
  const startOf = new Map(exhibitions.map((e) => [e.id, e.startDate]));
  const exIds = [...new Set(participants.map((p) => p.exhibitionId))];
  const booths = (await Promise.all(exIds.map((id) => repo.listBoothsFull(id))))
    .flat()
    .filter((b) => boothIds.has(b.id))
    .sort((a, b) => (startOf.get(b.exhibitionId) ?? "").localeCompare(startOf.get(a.exhibitionId) ?? ""));

  const existing = await repo.listProfileFields({ exhibitorIds: [exhibitorId] });
  const cur = (k: string) => existing.find((f) => f.field === k);
  const result: DraftResult = { exhibitorId, written: [], skipped: [], gate: null, usedLlm: false };
  const subject = { exhibitorId };
  const write = async (field: string, value: unknown, sources: string[], status: ProfileField["status"]) => {
    const checked = parseFieldValue(subject, field, value);
    if (!checked.ok) {
      result.skipped.push({ field, reason: checked.message });
      return false;
    }
    // 읽은 뒤 LLM을 부르는 사이에 사람이 칸을 확인하거나 고쳤으면 덮지 않는다(조건부 쓰기, DB에서 판단).
    const before = cur(field);
    const r = await repo.upsertProfileFieldIfUnchanged(
      { subject, field, value: checked.value, sources, status, actor: DRAFT_ACTOR },
      before ? { status: before.status, updatedAt: before.updatedAt } : null,
    );
    if (!r.ok) {
      result.skipped.push({
        field,
        reason: r.reason === "changed" ? CHANGED_REASON : "브랜드를 찾을 수 없어요",
      });
      return false;
    }
    // 같은 실행에서 같은 칸을 다시 쓸 때 방금 쓴 행을 기준으로 삼는다.
    const i = existing.findIndex((f) => f.field === field);
    if (i >= 0) existing[i] = r.field;
    else existing.push(r.field);
    result.written.push({ field, status });
    return true;
  };
  const guard = (field: string) => {
    if (workerMayWrite(cur(field))) return true;
    result.skipped.push({ field, reason: `이미 ${FIELD_STATUS_LABEL[cur(field)!.status]} 칸이라 건드리지 않아요` });
    return false;
  };

  // ── 1. 결정적으로 모으는 칸 ───────────────────────────────────────────────
  const links: { kind: "instagram" | "site"; url: string }[] = [];
  const linkSrc = new Set<string>();
  const seen = new Set<string>();
  for (const b of booths)
    for (const [kind, url] of [
      ["instagram", b.instagramUrl],
      ["site", b.websiteUrl],
    ] as const) {
      const key = url ? (anchorKey(url)?.match ?? url) : null;
      if (!url || !key || seen.has(key)) continue;
      seen.add(key);
      links.push({ kind, url });
      linkSrc.add(`roam:booth/${b.id}`);
    }
  if (links.length && guard("links")) await write("links", links, [...linkSrc], "collected");

  const aliasBooths = booths.filter((b) => b.name !== exhibitor.canonicalName);
  const aliases = [...new Set(aliasBooths.map((b) => b.name))];
  if (aliases.length && guard("aliases"))
    await write("aliases", aliases, [...new Set(aliasBooths.map((b) => `roam:booth/${b.id}`))], "collected");

  // ── 2. 공식 소개 + 말투 변환 + 게이트 ─────────────────────────────────────
  const intro = pickIntro(booths);
  const artistName = typeof cur("artistName")?.value === "string" ? (cur("artistName")!.value as string) : undefined;
  const protectedTerms = [
    exhibitor.canonicalName,
    ...booths.map((b) => b.name),
    ...(artistName ? [artistName] : []),
    ...ITEM_OPTIONS,
    ...booths.flatMap((b) => b.enrichment?.goodsKeywords ?? []),
  ];
  const fairNames = exhibitions.filter((e) => exIds.includes(e.id)).map((e) => e.name);
  const curIntro = cur("intro");
  if (introNeedsTone(curIntro) && deps.convertTone) {
    // 원문만 모아 둔 공식 소개(브랜드 먼저 인입, 또는 LLM 없이 돈 워커) — 원문과 출처는 그대로 두고
    // 말투만 바꾼다. 없으면 이 칸은 앱에 영영 안 보인다(publicValue는 display만 보여 준다).
    const original = (curIntro!.value as { original: string }).original;
    result.usedLlm = true;
    const { display, gate } = await rewriteIntro(deps.convertTone, { original, protectedTerms, brandName: exhibitor.canonicalName, fairNames });
    result.gate = gate;
    await write("intro", { original, display, gate }, curIntro!.sources, gate.ok ? "collected" : "ai_draft");
  } else if (intro && guard("intro")) {
    if (deps.convertTone) {
      result.usedLlm = true;
      const { display, gate } = await rewriteIntro(deps.convertTone, {
        original: intro.text,
        protectedTerms,
        brandName: exhibitor.canonicalName,
        fairNames,
      });
      result.gate = gate;
      await write("intro", { original: intro.text, display, gate }, [intro.source], gate.ok ? "collected" : "ai_draft");
    } else {
      // LLM이 없으면 원문만 모은다. 바꾼 문장이 없으니 앱에는 안 보인다(publicValue).
      await write("intro", { original: intro.text }, [intro.source], "collected");
    }
  }

  // ── 3. AI 초안 칸 ─────────────────────────────────────────────────────────
  if (!deps.draftFields) {
    result.skipped.push({ field: "ai", reason: "LLM이 없어 AI 초안 칸은 건너뛰어요" });
    return result;
  }
  const wanted = AI_DRAFT_FIELDS.filter((f) => workerMayWrite(cur(f)));
  if (wanted.length === 0) return result;

  const materials: Material[] = booths.map(boothMaterial).filter((m): m is Material => !!m);
  // 부스가 없는 출전(브랜드 먼저 인입)은 부스 자료가 없다. 인입이 공식 출처와 함께 모아 둔 소개 원문을
  // 자료로 쓴다 — 출처가 그 URL이라 초안의 sources도 그 URL만 가리킬 수 있다. 출처 없는 원문은 쓰지 않는다.
  const introField = cur("intro");
  const introOriginal = (introField?.value as { original?: unknown } | null | undefined)?.original;
  const introSource = introField?.sources.find((s) => /^https?:\/\//.test(s));
  if (
    introField &&
    introField.status !== "ai_draft" &&
    introField.status !== "stale" &&
    typeof introOriginal === "string" &&
    introOriginal.trim() &&
    introSource &&
    !materials.some((m) => m.id === introSource)
  )
    materials.push({ id: introSource, text: `공식 소개: ${introOriginal.trim()}` });
  if (deps.fetchText) {
    const urls = [...new Set(booths.map((b) => b.websiteUrl).filter((u): u is string => !!u && mayFetch(u)))].slice(0, 3);
    for (const url of urls) {
      const text = await deps.fetchText(url).catch(() => null);
      if (text && text.trim().length > 40) materials.push({ id: url, text: text.slice(0, 6000) });
    }
  }
  if (materials.length === 0) {
    result.skipped.push({ field: "ai", reason: "근거로 쓸 자료가 없어요(합성 소개뿐)" });
    return result;
  }

  const lessons = lessonLines(brandFieldLessons(await repo.listChanges({ entity: "brand_profile_field", limit: 300 })));
  result.usedLlm = true;
  const raw = await deps.draftFields({
    system: draftSystemPrompt(lessons),
    prompt: draftUserPrompt({ name: exhibitor.canonicalName, artistName }, materials),
  });
  const parsed = draftOutputSchema.safeParse(raw);
  if (!parsed.success) {
    result.skipped.push({ field: "ai", reason: "모델 출력이 형식에 맞지 않아요" });
    return result;
  }
  const allowedSources = new Set(materials.map((m) => m.id));
  const drafted = new Map<string, { value: unknown; sources: string[] }>();
  for (const f of parsed.data.fields) {
    if (!(wanted as readonly string[]).includes(f.field)) continue;
    const sources = [...new Set(f.sources.filter((s) => allowedSources.has(s)))];
    if (sources.length === 0) {
      result.skipped.push({ field: f.field, reason: "출처가 없어 버렸어요" });
      continue;
    }
    drafted.set(f.field, { value: f.value, sources });
  }
  // 정체 한 줄은 근거 칸이 하나라도 있어야 쓴다(기준 문서 3장).
  const hasBasis =
    IDENTITY_BASIS_FIELDS.some((k) => drafted.has(k) || (cur(k) !== undefined && cur(k)!.status !== "stale")) ||
    result.written.some((w) => w.field === "intro");
  for (const [field, d] of drafted) {
    if (field === "identityLine" && !hasBasis) {
      result.skipped.push({ field, reason: "근거 칸이 비어 정체 한 줄을 쓰지 않아요" });
      continue;
    }
    await write(field, d.value, d.sources, "ai_draft");
  }
  return result;
}
