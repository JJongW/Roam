// 사진 허락 DM 문구 — 박람회별 틀에 브랜드 이름을 채운다. 순수 모듈, I/O 없음.
//
// 보내기는 사람이 한다(2026-11-17 Ted: "자동으로 보내지는 않아도"). 보드는 채운 문구를
// 클립보드에 넣거나 메일 초안(mailto)을 열기만 한다. 보내는 이는 늘 Roam이다
// (`OUTREACH_SENDER`, 개인 계정 금지).
//
// 문안은 Ted가 쓴 것을 그대로 옮겼다(Roam-design docs/content/engine/runs/*/dm-template.md).
// Ted 문안은 윤문하지 않는다는 그쪽 규칙을 따른다. 바꾸려면 그 파일과 여기를 같이 고친다.
import { OUTREACH_SENDER } from "@/lib/constants";

export interface DmVars {
  brand: string;
  fair: string;
  /** 공식 계정이나 프로필에 나온 품목. 없으면 그 문장을 뺀다. */
  items?: string[];
}

/**
 * 틀의 자리표시:
 * - `{브랜드명}`, `{박람회명}`
 * - `{품목:을}` — 품목 + 받침에 맞는 조사(을/를). `{품목}`이면 조사 없이.
 * 값이 없는 자리표시가 든 문장은 통째로 뺀다(빈칸이나 "{품목}"이 그대로 나가지 않게).
 */
const GENERIC = `안녕하세요! {브랜드명}님!
@${OUTREACH_SENDER.instagram}에서 페어 부스를 소개하는 Roam 에디터입니다. 협업제안이 아닌 단순 소개 부탁이라 DM으로 보내는 점 죄송합니다..

다름이 아니오라 {박람회명} 참가 브랜드를 카드뉴스로 소개하려는데 {브랜드명}도 소개해 드려도 괜찮을까요? 괜찮으시다면 부스컷이나 제품 사진 1~2장을 쓰고 싶어요! 브랜드 이름만으로는 어떤 제품인지 알기 어려워서 보시는 분들이 마음에 드는 부스를 미리 찾아 두실 수 있게 제품을 함께 보여 드리려고 합니다. 특히 {품목:을} 보여 드리고 싶어요!

사진 위에 글을 얹어서 글자 없는 원본이 있으시면 보내 주실 수 있을까요? 카드와 캡션에 @계정을 적고 행사 전에 올릴 예정이며 올리기 전에 공유 드릴 예정이에요. 사례를 드리지 못하는 점은 양해 부탁드립니다.... 🥲

올린 뒤에도 고치거나 내려 달라고 하시면 바로 그렇게 하겠습니다. 부담되시면 편하게 거절해 주셔도 괜찮아요!`;

/** 박람회 slug별 문안. 없으면 GENERIC. */
const BY_SLUG: Record<string, string> = {
  // Roam-design runs/newyear-store-2026/dm-template.md (2026-11-05)
  "newyear-store-2026": `안녕하세요! {브랜드명}님!
@${OUTREACH_SENDER.instagram}에서 페어 부스를 소개하는 Roam 에디터입니다. 협업제안이 아닌 단순 소개 부탁이라 DM으로 보내는 점 죄송합니다..

다름이 아니오라 새해 준비상점 N.27 참가 브랜드를 카드뉴스로 소개하려는데 {브랜드명}도 소개해 드려도 괜찮을까요? 괜찮으시다면 부스컷이나 제품 사진 1~2장을 쓰고 싶어요! 브랜드 이름만으로는 어떤 제품인지 알기 어려워서 보시는 분들이 마음에 드는 부스를 미리 찾아 두실 수 있게 제품을 함께 보여 드리려고 합니다. 특히 새해 준비상점 계정에 소개된 {품목:을} 보여 드리고 싶어요!

사진 위에 글을 얹어서 글자 없는 원본이 있으시면 보내 주실 수 있을까요? 카드와 캡션에 @계정을 적고 행사 전에 올릴 예정이며 올리기 전에 공유 드릴 예정이에요. 행사 직전에 한 번 더 모아 소개할 때도 같은 사진을 써도 괜찮을지 함께 여쭤요. 사례를 드리지 못하는 점은 양해 부탁드립니다.... 🥲

올린 뒤에도 고치거나 내려 달라고 하시면 바로 그렇게 하겠습니다. 부담되시면 편하게 거절해 주셔도 괜찮아요!`,
};

export function dmTemplateFor(slug: string): string {
  return BY_SLUG[slug] ?? GENERIC;
}

/** 마지막 글자에 받침이 있나. 한글이 아니면(영문, 숫자) 받침 없음으로 본다. */
export function hasBatchim(word: string): boolean {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return false;
  return code % 28 !== 0;
}

/** 품목 두 개까지 "A와 B"로 잇는다. */
export function joinItems(items: string[]): string {
  const xs = items.map((s) => s.trim()).filter(Boolean).slice(0, 2);
  if (xs.length < 2) return xs[0] ?? "";
  return `${xs[0]}${hasBatchim(xs[0]) ? "과" : "와"} ${xs[1]}`;
}

const TOKEN = /\{(브랜드명|박람회명|품목)(?::(을|를|이|가|은|는|과|와))?\}/g;
const PAIR: Record<string, [string, string]> = {
  을: ["을", "를"], 를: ["을", "를"],
  이: ["이", "가"], 가: ["이", "가"],
  은: ["은", "는"], 는: ["은", "는"],
  과: ["과", "와"], 와: ["과", "와"],
};

/** 문장 단위로 자른다(줄바꿈은 지킨다). 마침표, 물음표, 느낌표 뒤 공백에서 끊는다. */
function sentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+/);
}

export function fillTemplate(template: string, vars: DmVars): string {
  const values: Record<string, string> = {
    브랜드명: vars.brand.trim(),
    박람회명: vars.fair.trim(),
    품목: joinItems(vars.items ?? []),
  };
  const fillSentence = (s: string): string | null => {
    let missing = false;
    const out = s.replace(TOKEN, (_, key: string, josa?: string) => {
      const v = values[key];
      if (!v) {
        missing = true;
        return "";
      }
      if (!josa) return v;
      const [withB, without] = PAIR[josa];
      return v + (hasBatchim(v) ? withB : without);
    });
    return missing ? null : out;
  };
  return template
    .split("\n")
    .map((line) =>
      sentences(line)
        .map(fillSentence)
        .filter((s): s is string => s !== null)
        .join(" "),
    )
    .join("\n");
}

export function buildDm(slug: string, vars: DmVars): string {
  return fillTemplate(dmTemplateFor(slug), vars);
}

/** 메일 초안. 보내는 주소는 메일 앱에서 Roam 팀 메일로 골라야 한다(mailto는 보내는 이를 못 정한다). */
export function mailtoLink(to: string, slug: string, vars: DmVars): string {
  const subject = `[Roam] ${vars.fair} 참가 브랜드 소개 사진 문의`;
  const body = buildDm(slug, vars);
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** `@abc`, `instagram.com/abc/`, `https://www.instagram.com/abc?igsh=..` → `abc`. 메일이나 엉뚱한 값은 null. */
export function normalizeHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim();
  if (!s || isEmail(s)) return null;
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(s) ? s.toLowerCase() : null;
}

export function isEmail(s: string | null | undefined): boolean {
  return !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

export const instagramProfileUrl = (h: string) => `https://www.instagram.com/${h}/`;
/** 인스타 DM 창을 바로 연다(로그인한 계정으로). 보내는 계정이 Roam인지는 사람이 확인한다. */
export const instagramDmUrl = (h: string) => `https://ig.me/m/${h}`;
