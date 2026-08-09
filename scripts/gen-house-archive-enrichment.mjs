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
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";

const CSV = "public/house_archive_br/house_archive_full_directory.csv";
const IMG_SRC = "public/house_archive_br/house_archive_images";
const IMG_OUT = "public/booths/house-archive";
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

/** 이 스크립트는 node로 직접 실행되므로 Next.js의 .env 자동 로드를 못 받는다 — 직접 읽는다. */
function loadSupabaseCreds() {
  const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const get = (name) => text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

const ORIGINALS_BUCKET = "booth-originals";
const ORIGINALS_PREFIX = "house-archive-2026";

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

// 브랜드 이미지 — 원본은 1568x662 캔버스에 세로 포스터가 검은 여백과 함께 박혀 있고,
// 위아래로 페어 공통 크롬(HOUSE ARCHIVE 헤더 / 날짜 바)이 붙어 있다. 여백을 트림하고
// 크롬을 잘라내면 브랜드 사진만 남는다(부스마다 다른 그림 = 썸네일로 쓸 값어치가 생김).
// 파일명은 `{브랜드}_{인스타핸들}.jpg`라 핸들로 부스 코드에 잇는다.
const handleToCode = new Map();
for (const r of data) {
  const h = (r[col.instagram_handle] || "").trim();
  const c = (r[col.booth_code] || "").trim() ||
    codeByName.get(r[col.vendor_name].replace(/\s/g, "")) || "";
  if (h && c && out[c]) handleToCode.set(h, c);
}
let images = 0;
let originalsUploaded = 0;

const creds = loadSupabaseCreds();
const supabase =
  creds.url && creds.key ? createClient(creds.url, creds.key) : null;
if (!supabase) {
  warn.push("Supabase 자격증명 없음 — 원본 백업 업로드를 건너뜀(크롭·JSON은 계속 진행)");
}

if (existsSync(IMG_SRC)) {
  mkdirSync(IMG_OUT, { recursive: true });
  for (const file of readdirSync(IMG_SRC)) {
    const handle = file.replace(/\.[a-z]+$/i, "").split("_").slice(1).join("_");
    const code = handleToCode.get(handle);
    if (!code) {
      warn.push(`이미지 매칭 실패: ${file}`);
      continue;
    }
    const src = `${IMG_SRC}/${file}`;
    const trimmed = await sharp(src)
      .trim({ threshold: 10 })
      .toBuffer({ resolveWithObject: true });
    const { width, height } = trimmed.info;
    const top = Math.round(height * 0.15); // 페어 헤더
    const bottom = Math.round(height * 0.08); // 날짜 바
    await sharp(trimmed.data)
      .extract({ left: 0, top, width, height: height - top - bottom })
      .resize({ width: 480 })
      .webp({ quality: 72 })
      .toFile(`${IMG_OUT}/${code}.webp`);
    out[code].image = `/booths/house-archive/${code}.webp`;
    images++;
    if (supabase) {
      const ext = file.match(/\.[a-z]+$/i)?.[0] ?? ".jpg";
      try {
        const { error: uploadError } = await supabase.storage
          .from(ORIGINALS_BUCKET)
          .upload(`${ORIGINALS_PREFIX}/${code}${ext}`, readFileSync(src), {
            contentType: ext === ".png" ? "image/png" : "image/jpeg",
            upsert: true,
          });
        if (uploadError) {
          warn.push(`원본 백업 업로드 실패: ${code} — ${uploadError.message}`);
        } else {
          originalsUploaded++;
        }
      } catch (e) {
        warn.push(`원본 백업 업로드 실패: ${code} — ${e.message}`);
      }
    }
  }
}

const sorted = Object.fromEntries(
  Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
);
writeFileSync(OUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`이미지 ${images}장 → ${IMG_OUT}`);
if (supabase) {
  console.log(`원본 백업 ${originalsUploaded}/${images}장 → Supabase '${ORIGINALS_BUCKET}/${ORIGINALS_PREFIX}'`);
}

console.log(`${OUT} — ${Object.keys(sorted).length}개 부스`);
console.log(`도면 부스 ${floorCodes.size}개 중 소개 없는 부스 ${floorCodes.size - Object.keys(sorted).length}개`);
for (const w of warn) console.log(`  · ${w}`);
