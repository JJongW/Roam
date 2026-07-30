// public/house_archive_br/*.csv → src/lib/booth/enrichment-house-archive-2026.json
//
// 하우스 아카이브 부스 소개는 주최 측 디렉터리(브랜드 소개 + 부스코드 + 인스타)로 받았다.
// 손으로 69개를 옮기면 오타와 누락이 생기고 자료가 갱신될 때마다 또 옮겨야 하므로,
// CSV를 진실로 두고 여기서 뽑는다. 결과 JSON만 커밋한다(원본 CSV·이미지는 gitignore).
//
//   node scripts/gen-house-archive-enrichment.mjs
//
// 손으로 쓴 필드(roamInterpretation 등 저작 문구)는 기존 JSON에서 보존한다 — 재생성이
// 저작물을 덮어쓰면 아무도 저작을 안 하게 된다.
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const CSV = "public/house_archive_br/house_archive_full_directory.csv";
const OUT = "src/lib/booth/enrichment-house-archive-2026.json";
const FLOORPLAN = "src/lib/floorplan-house-archive.json";
const NAMES = "src/lib/booth/house-archive-2026.json";
/** 저작 필드 — 재생성해도 덮지 않는다. */
const AUTHORED = [
  "roamInterpretation",
  "recommendationReasons",
  "valueTags",
  "thingsToDo",
  "timing",
  "memoryHooks",
  "conversationPrompts",
  "tips",
];

/** 따옴표 안의 콤마·개행을 지키는 최소 CSV 파서. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = false;
      } else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else if (c !== "\r") cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

const rows = parseCsv(readFileSync(CSV, "utf8").replace(/^﻿/, ""));
const head = rows[0].map((h) => h.trim());
const col = Object.fromEntries(head.map((h, i) => [h, i]));
const data = rows.slice(1).filter((r) => r.length > 1 && r[0].trim());

// 코드 검증용 — 도면에 없는 코드는 조용히 버리지 않고 경고한다.
const floorCodes = new Set(
  JSON.parse(readFileSync(FLOORPLAN, "utf8")).booths.map((b) => b.code),
);
// 코드가 비어 있는 행은 이름으로 찾는다(디렉터리에 코드가 빠진 브랜드가 있다).
const names = JSON.parse(readFileSync(NAMES, "utf8"));
const codeByName = new Map();
for (const [code, n] of Object.entries(names)) {
  if (n.ko) codeByName.set(n.ko.replace(/\s/g, ""), code);
  if (n.en) codeByName.set(n.en.replace(/\s/g, ""), code);
}

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const out = {};
const warn = [];

for (const r of data) {
  const vendor = r[col.vendor_name].trim();
  const handle = (r[col.instagram_handle] || "").trim();
  const summary = (r[col.summary] || "").trim();
  let code = (r[col.booth_code] || "").trim();
  if (!code) {
    code = codeByName.get(vendor.replace(/\s/g, "")) ?? "";
    if (code) warn.push(`코드 없음 → 이름으로 매칭: ${vendor} → ${code}`);
  }
  if (!code) {
    warn.push(`버림(코드 못 찾음): ${vendor}`);
    continue;
  }
  if (!floorCodes.has(code)) {
    warn.push(`버림(도면에 없는 코드): ${vendor} → ${code}`);
    continue;
  }
  if (!summary) {
    warn.push(`소개 비어 있음: ${vendor} (${code})`);
    continue;
  }

  const existing = out[code];
  if (existing) {
    // 공동 부스(한 코드에 두 브랜드) — 소개를 이어 붙이고 출처도 함께 남긴다.
    warn.push(`공동 부스: ${code} — ${existing._vendor} + ${vendor}`);
    existing.summary = `${existing.summary} / ${vendor}: ${summary}`;
    existing._vendor = `${existing._vendor} + ${vendor}`;
    continue;
  }
  out[code] = {
    goodsKeywords: [],
    themeTags: [], // 테마는 도면 cat이 이미 부스 태그로 들어간다.
    summary,
    ...(handle ? { sourceUrl: `https://instagram.com/${handle}` } : {}),
    _vendor: vendor,
  };
}

// 저작 필드 보존 + 내부용 _vendor 제거.
for (const [code, e] of Object.entries(out)) {
  delete e._vendor;
  for (const key of AUTHORED) {
    if (prev[code]?.[key] !== undefined) e[key] = prev[code][key];
  }
}

const sorted = Object.fromEntries(
  Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);

console.log(`${OUT} — ${Object.keys(sorted).length}개 부스`);
console.log(`도면 부스 ${floorCodes.size}개 중 소개 없는 부스 ${floorCodes.size - Object.keys(sorted).length}개`);
for (const w of warn) console.log(`  · ${w}`);
