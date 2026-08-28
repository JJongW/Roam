// gen-assets.mjs — 보태니컬 에셋 배치 생성기
// -----------------------------------------------------------------------------
// STYLE는 고정하고 "변수"만 바꿔 한 번에 여러 장을 뽑는다.
//
// 준비:
//   npm init -y
//   npm i openai            # PROVIDER="openai" 쓸 때 (투명 배경 지원)
//   npm i @google/genai     # PROVIDER="gemini" 쓸 때 (이미 쓰던 Gemini 키)
//   export OPENAI_API_KEY=sk-...     또는     export GEMINI_API_KEY=...
//   node gen-assets.mjs
//
// 팁: 먼저 DRY_RUN=true 로 프롬프트만 찍어보고, 좋으면 false 로 실제 생성.
// -----------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";

// ── 설정 ─────────────────────────────────────────────────────────────────────
const PROVIDER = "gemini";        // "openai" | "gemini"
const DRY_RUN = false;            // true면 API 호출 없이 프롬프트만 출력
const VARIATIONS_PER = 1;         // 프롬프트당 몇 장 (검증되면 2~로 늘리기)
const OUT_DIR = "./assets";
const TRANSPARENT = true;         // openai 전용. gemini(Imagen)는 항상 불투명
const DELAY_MS = 1500;            // 호출 간 간격(레이트리밋 여유)
const ONLY = "tree_hero";        // 이 name 하나만 뽑기. 전체 뽑으려면 null 로.

// ── STYLE 블록 (절대 바꾸지 않는 결) ─────────────────────────────────────────
const STYLE = `Hand-painted digital gouache illustration with rich, visible dry-brush texture and grainy stippled brushstrokes — tactile thick paint, crisp and highly detailed, no outlines. Slightly naive yet refined, cozy storybook mood. Muted warm palette: burnt orange and soft tangerine, layered sage-to-forest greens, a few tiny powder-blue leaf accents, warm brown. Painted on a warm off-white cream watercolor-paper background with visible paper grain. The subject is centered and fills most of the frame (roughly 75%), leaving only a small clean margin. Calm, editorial, artisanal. NOT vector, not flat, not 3D, not a photo, no blur, no soft focus, no outline, no lettering.`;

// ── 변수 풀 ──────────────────────────────────────────────────────────────────
const SPECIES    = ["orange tree", "olive tree", "lemon tree", "eucalyptus branch", "lavender sprig", "wildflower sprig", "fern frond", "wisteria vine"];
const SILHOUETTE = ["a soft round canopy", "tall and slender", "windswept and leaning", "sparse and airy", "lush and full", "gently weeping / cascading"];
const LEAVES     = ["just a few leaves", "sparse leaves", "densely layered leaves"];
const BLOOMS     = ["no flowers", "a single bloom", "a few tiny blossoms", "abundant tiny flowers"];
const COMPOSITION= ["centered", "off to one side", "anchored at the bottom", "trailing from the top corner"];

// ── JOBS: 뽑을 목록 ──────────────────────────────────────────────────────────
// (A) 포폴 핵심 5종 — 손으로 지정
const CURATED = [
  { name: "tree_hero",  aspect: "3:4",  subject: "A single orange tree — a rounded canopy of layered green gouache dabs with a few orange fruits and two small powder-blue leaf accents, and a slender warm-brown trunk. Centered, filling most of the frame" },
  { name: "sprig",      aspect: "3:4",  subject: "A sprig of small orange blossoms on one curving green stem with a few leaves, loose and painterly. Centered, filling most of the frame" },
  { name: "leaf",       aspect: "1:1",  subject: "A single leafy twig with a few textured green gouache leaves, painterly. Centered, filling most of the frame" },
  { name: "bloom",      aspect: "1:1",  subject: "One orange flower with a soft yellow center and two green leaves, loose gouache brushwork. Centered, filling most of the frame" },
  { name: "vine",       aspect: "9:16", subject: "A long trailing vine curving gently down, with a few small orange flowers and leaves along it, delicate and painterly. Filling the tall frame from top to bottom" },
];

// (B) 변수 조합 탐색 — 자동 확장 (원하는 만큼 켜기). MAX_COMBO로 폭주 방지.
const USE_COMBOS = false;   // 검증되면 true 로 (변수 조합 다양하게 뽑기)
const MAX_COMBO = 12;
function buildCombos() {
  const out = [];
  for (const sp of SPECIES) for (const si of SILHOUETTE) for (const lf of LEAVES) for (const bl of BLOOMS) {
    out.push({
      name: `x_${sp}_${si}_${lf}_${bl}`.replace(/[^a-z0-9]+/gi, "-").slice(0, 60),
      aspect: "3:4",
      subject: `A small ${sp}, ${si}, ${lf}, ${bl}, ${pick(COMPOSITION)} on a large empty cream page`,
    });
  }
  return shuffle(out).slice(0, MAX_COMBO);
}

// (C) 한 장에 여러 개 — 탐색용 견본 시트
const SHEET = { name: "sheet_explore", aspect: "1:1", subject: "A tidy grid of 9 different tiny plants — various small trees, sprigs, and wildflowers, each a different silhouette and leaf density — evenly spaced on one cream page" };

// ── 유틸 ────────────────────────────────────────────────────────────────────
function pick(a){ return a[Math.floor(Math.random()*a.length)]; }
function shuffle(a){ return a.map(v=>[Math.random(),v]).sort((x,y)=>x[0]-y[0]).map(v=>v[1]); }
function buildPrompt(subject){ return `${subject}. ${STYLE}`; }
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── 프로바이더 ───────────────────────────────────────────────────────────────
async function genOpenAI(prompt, aspect) {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const size = aspect === "1:1" ? "1024x1024" : "1024x1536"; // 세로형은 1024x1536
  const res = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
    n: VARIATIONS_PER,
    ...(TRANSPARENT ? { background: "transparent" } : {}),
  });
  return res.data.map(d => Buffer.from(d.b64_json, "base64"));
}

async function genGemini(prompt, aspect) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY });
  // Imagen(predict)은 유료/미지원 키가 많아 404가 남 → Gemini 이미지 생성 모델을 generateContent로 사용.
  const MODELS = (process.env.IMAGE_MODEL ? [process.env.IMAGE_MODEL] : []).concat([
    "gemini-3-pro-image",       // 최고 품질 (Nano Banana Pro). 비싸면 IMAGE_MODEL=gemini-2.5-flash-image 로 강제
    "gemini-2.5-flash-image",   // 빠르고 저렴한 폴백
  ]);
  const out = [];
  for (let v = 0; v < VARIATIONS_PER; v++) {
    let got = null, lastErr;
    for (const model of MODELS) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { responseModalities: ["IMAGE", "TEXT"], imageConfig: { aspectRatio: aspect } },
        });
        const parts = res.candidates?.[0]?.content?.parts || [];
        const img = parts.find(p => p.inlineData);
        if (img) { got = Buffer.from(img.inlineData.data, "base64"); break; }
      } catch (e) { lastErr = e; }
    }
    if (got) out.push(got); else if (lastErr) throw lastErr;
  }
  return out;
}

const GEN = { openai: genOpenAI, gemini: genGemini };

// ── 메인 ────────────────────────────────────────────────────────────────────
async function run() {
  const all = [...CURATED, SHEET, ...(USE_COMBOS ? buildCombos() : [])];
  const jobs = ONLY ? all.filter(j => j.name === ONLY) : all;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`▸ ${PROVIDER} · ${jobs.length} jobs × ${VARIATIONS_PER} = ${jobs.length*VARIATIONS_PER} images\n`);

  for (const [i, job] of jobs.entries()) {
    const prompt = buildPrompt(job.subject);
    console.log(`[${i+1}/${jobs.length}] ${job.name}`);
    if (DRY_RUN) { console.log("   " + prompt + "\n"); continue; }

    let bufs, tries = 0;
    while (true) {
      try { bufs = await GEN[PROVIDER](prompt, job.aspect); break; }
      catch (e) {
        if (++tries >= 3) { console.error("   ✗ 실패:", e.message, "\n"); bufs = []; break; }
        console.warn(`   … 재시도 ${tries} (${e.message})`); await sleep(3000 * tries);
      }
    }
    bufs.forEach((b, k) => {
      const file = path.join(OUT_DIR, `${job.name}${bufs.length>1?`_${k+1}`:""}.png`);
      fs.writeFileSync(file, b);
      console.log("   ✓ " + file);
    });
    await sleep(DELAY_MS);
  }
  console.log("\n완료 → " + path.resolve(OUT_DIR));
}
run().catch(e => { console.error(e); process.exit(1); });
