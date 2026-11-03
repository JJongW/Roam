// 브랜드 프로필 AI 초안 — 워커 잡 `brand_profile_draft`의 본체(설계: 2단계 보고서 8장,
// 기준 문서 brand-profile-spec 6장 ③ ~ ④). 브랜드 하나씩 돈다.
//
// 1. 결정적으로 모으는 칸(collected): 링크, 다른 이름 — LLM 없음.
// 2. 공식 소개(intro): 원문은 그대로 두고 LLM이 말투만 바꾼다 → 결정적 게이트(tone-gate.ts).
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
import { checkToneConversion } from "@/lib/brands/tone-gate";
import { brandFieldLessons, lessonLines } from "@/lib/brands/lessons";
import {
  AI_DRAFT_FIELDS,
  IDENTITY_BASIS_FIELDS,
  ITEM_OPTIONS,
  TEXTURE_OPTIONS,
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
  /** 말투 변환. 원문을 받아 Roam 말투 문장을 돌려준다. */
  convertTone?: (input: { original: string; protectedTerms: string[] }) => Promise<string>;
  /** 공개 페이지 본문(글자만). 못 읽으면 null. */
  fetchText?: (url: string) => Promise<string | null>;
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

export const TONE_SYSTEM = [
  "너는 Roam의 문장 손질 담당이다. 브랜드 공식 소개 원문을 Roam 말투로 바꾼다. 내용은 한 글자도 더하거나 빼지 않는다.",
  "규칙:",
  "- 해요체로 쓴다. 합니다체, 반말을 섞지 않는다.",
  '- "전시", "전시회", "전시장"을 쓰지 않는다. 박람회, 페어, 행사로 바꾼다. 원문 고유명사 안의 말은 그대로 둔다.',
  "- 가운뎃점(·)을 쓰지 않는다. 쉼표나 와, 과로 바꾼다.",
  "- 숫자, 영문 표기, 브랜드 이름, 작가 이름, 품목 이름은 그대로 둔다.",
  "- 원문에 없는 칭찬, 과장, 단정(최고, 유일, 꼭, 무조건 등)을 넣지 않는다. 느낌표를 늘리지 않는다.",
  "- 길이는 원문과 비슷하게. 문장을 합치거나 나누는 정도만 한다.",
  "- 바꾼 문장만 출력한다. 따옴표나 설명을 붙이지 않는다.",
].join("\n");

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
    await repo.upsertProfileField({ subject, field, value: checked.value, sources, status, actor: DRAFT_ACTOR });
    result.written.push({ field, status });
    return true;
  };
  const guard = (field: string) => {
    if (workerMayWrite(cur(field))) return true;
    result.skipped.push({ field, reason: `이미 ${cur(field)!.status} 칸이라 건드리지 않아요` });
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
  if (intro && guard("intro")) {
    if (deps.convertTone) {
      result.usedLlm = true;
      const display = (await deps.convertTone({ original: intro.text, protectedTerms })).trim();
      const gate = checkToneConversion({ original: intro.text, display, protectedTerms });
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
