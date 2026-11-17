// 인스타 계정 csv 가져오기 — 미리보기 계획. 순수 함수, I/O 없음.
//
// 입력 예: Roam-design runs/newyear-store-2026/official-brands-2026-11-16.csv
//   (name_ko, name_en, instagram, confidence[확실|높음|후보], evidence_url ...)
// 문구전 permissions.csv(team, artist, instagram, instagramStatus[confirmed|needs-check])도 받는다.
//
// 저장 자리: 브랜드(exhibitor) 프로필의 `links` 칸. 인스타는 부스가 아니라 브랜드의 속성이고,
// 부스 번호가 아직 없는 박람회(새해 준비상점)도 브랜드는 있어서 바로 쓸 수 있다.
// 규칙은 인입과 같다 — **빈 칸만 채운다.** 이미 다른 인스타가 있으면 충돌로 보여 주고 덮지 않는다.
// 자동으로 돌지 않는다. 사람이 미리보기를 보고 "적용"을 눌러야 쓴다.
import { flatName } from "@/lib/exhibitor/identity";
import { normalizeHandle } from "@/lib/brands/outreach";
import { CONFIDENCE_SOURCE_PREFIX, type HandleConfidence } from "@/lib/brands/board";

/** RFC 4180 csv. 따옴표 안 쉼표, 줄바꿈, `""` 이스케이프를 처리한다. 첫 줄은 머리글. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const NAME_COLS = ["name_ko", "team", "name", "brand", "브랜드", "이름"];
const ALIAS_COLS = ["name_en", "artist", "alias"];
const HANDLE_COLS = ["instagram", "인스타", "handle"];

export function parseConfidence(raw: string | undefined): HandleConfidence | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "확실" || v === "confirmed") return "confirmed";
  if (v === "높음" || v === "high") return "high";
  if (v === "후보" || v === "needs-check" || v === "candidate" || v === "중간" || v === "낮음") return "candidate";
  return null;
}

export interface ImportLine {
  line: number;
  name: string;
  aliases: string[];
  handle: string | null;
  confidence: HandleConfidence | null;
  evidence: string | null;
}

export function readImportLines(rows: Record<string, string>[]): ImportLine[] {
  const pick = (r: Record<string, string>, cols: string[]) => cols.map((c) => r[c]).find((v) => v && v.trim());
  return rows.map((r, i) => {
    const evidence = r.evidence_url || r.instagramSource || "";
    return {
      line: i + 2,
      name: pick(r, NAME_COLS) ?? "",
      aliases: ALIAS_COLS.map((c) => r[c]).filter((v): v is string => !!v && !!v.trim()),
      handle: normalizeHandle(pick(r, HANDLE_COLS)),
      // 신뢰도 칸이 없으면 계정이 있는 줄은 "후보"로 본다(모르면 낮게).
      confidence: parseConfidence(r.confidence ?? r.instagramStatus) ?? (pick(r, HANDLE_COLS) ? "candidate" : null),
      evidence: /^https?:\/\//.test(evidence) ? evidence : null,
    };
  });
}

export interface ImportTarget {
  exhibitorId: string;
  /** 이 박람회 표기 이름, 브랜드 이름, 다른 이름. */
  names: string[];
  /** 지금 브랜드에 있는 인스타(프로필 links 칸, 없으면 부스나 브랜드 링크). */
  currentHandle: string | null;
}

export type ImportDecision = "fill" | "same" | "conflict" | "no-handle" | "unmatched" | "ambiguous";
export const IMPORT_DECISION_LABEL: Record<ImportDecision, string> = {
  fill: "새로 넣어요",
  same: "이미 같아요",
  conflict: "다른 계정이 있어요(덮지 않아요)",
  "no-handle": "csv에 계정이 없어요",
  unmatched: "이 박람회에서 못 찾았어요",
  ambiguous: "이름이 같은 브랜드가 둘 이상이에요",
};

export interface ImportPlanLine extends ImportLine {
  decision: ImportDecision;
  exhibitorId: string | null;
  currentHandle: string | null;
}

/** 이름 키(identity.ts flatName)로만 맞춘다. 같은 박람회 안의 공식 명단끼리라 이름 일치를 받는다(brands.v1과 같은 판단). */
export function planHandleImport(lines: ImportLine[], targets: ImportTarget[]): ImportPlanLine[] {
  const byKey = new Map<string, Set<string>>();
  const byId = new Map(targets.map((t) => [t.exhibitorId, t]));
  for (const t of targets)
    for (const n of t.names) {
      const k = flatName(n);
      if (!k) continue;
      const s = byKey.get(k) ?? new Set<string>();
      s.add(t.exhibitorId);
      byKey.set(k, s);
    }
  // 같은 브랜드에 맞는 줄이 둘이면 앞줄이 넣은 계정을 "지금 계정"으로 보고 판단한다.
  const filled = new Map<string, string>();
  return lines.map((l) => {
    const ids = new Set<string>();
    for (const n of [l.name, ...l.aliases]) {
      const hit = byKey.get(flatName(n));
      // 한국어 이름이 맞으면 그걸 쓴다. 영문 이름은 한국어로 못 찾을 때만.
      if (hit) {
        hit.forEach((id) => ids.add(id));
        if (n === l.name) break;
      }
    }
    const base = { ...l, exhibitorId: null, currentHandle: null };
    if (ids.size === 0) return { ...base, decision: "unmatched" as const };
    if (ids.size > 1) return { ...base, decision: "ambiguous" as const };
    const t = byId.get([...ids][0])!;
    const cur = normalizeHandle(t.currentHandle) ?? filled.get(t.exhibitorId) ?? null;
    const decision: ImportDecision = !l.handle ? "no-handle" : !cur ? "fill" : cur === l.handle ? "same" : "conflict";
    if (decision === "fill") filled.set(t.exhibitorId, l.handle!);
    return { ...base, exhibitorId: t.exhibitorId, currentHandle: cur, decision };
  });
}

/** 적용 때 links 칸 출처 목록: 근거 URL, csv 이름과 줄, 신뢰도 표시. */
export function importSources(l: ImportLine, fileName: string): string[] {
  return [
    ...(l.evidence ? [l.evidence] : []),
    `csv:${fileName}#${l.line}`,
    ...(l.confidence ? [`${CONFIDENCE_SOURCE_PREFIX}${l.confidence}`] : []),
  ];
}

export function importSummary(plan: ImportPlanLine[]): Record<ImportDecision, number> {
  const out: Record<ImportDecision, number> = { fill: 0, same: 0, conflict: 0, "no-handle": 0, unmatched: 0, ambiguous: 0 };
  for (const p of plan) out[p.decision]++;
  return out;
}
