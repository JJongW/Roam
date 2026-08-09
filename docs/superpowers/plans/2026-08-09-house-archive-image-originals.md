# House Archive Image Originals Durability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the raw Instagram screenshots used to crop `enrichment-house-archive-2026.json`'s booth images recoverable even if the local `public/house_archive_br/house_archive_images/` folder (gitignored) is lost or corrupted, without exposing those third-party photos in the public GitHub repo.

**Architecture:** `scripts/gen-house-archive-enrichment.mjs` already crops each matched source image into a public webp thumbnail (`public/booths/house-archive/{code}.webp`, committed to git — unchanged, still public). This plan adds one step at the end of that same image loop: upload the untouched original file to a new **private** Supabase Storage bucket (`booth-originals`, path-prefixed `house-archive-2026/{code}{ext}`), reusing the `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` already in `.env`. Full design rationale: `docs/superpowers/specs/2026-08-09-house-archive-image-originals-design.md`.

**Tech Stack:** Node.js (plain `.mjs` script, no bundler), `sharp` (already used), `@supabase/supabase-js` (already a dependency, not yet used from any script — first script-level consumer).

## Global Constraints

- Reuse `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the repo-root `.env` — no new credentials, no new npm dependency.
- Upload failure must **never** abort the script's core output (JSON + webp generation). Warn and continue, exactly like the script's existing `warn.push(...)` pattern for match failures.
- The bucket must be **private** — the whole point is these are third-party Instagram photos that must not be publicly redistributable via the public repo or a public bucket.
- Object path is prefixed with the exhibition slug (`house-archive-2026/`) so a future exhibition reusing the same bucket can't collide on a shared code like `H01`.
- No automated test is added. This script has zero test coverage today (pure data-pipeline script, run manually by an operator) and the design spec explicitly keeps that convention — verification is running the script and reading its console summary.
- Do not touch anything under `src/` or any other script — this plan's only file change is `scripts/gen-house-archive-enrichment.mjs`.

---

### Task 1: Create the private Supabase bucket (manual, one-time)

**Files:** none — this is a dashboard action, not a code change.

**Interfaces:**
- Produces: a bucket named exactly `booth-originals`, visibility **private**, that Task 2's code uploads into via the service-role key (which bypasses bucket RLS/policies entirely, so no storage policy needs to be configured).

- [ ] **Step 1: Create the bucket**

In the Supabase dashboard for this project (Storage section): create a new bucket named `booth-originals`. Leave "Public bucket" **unchecked** (private). No further policy configuration is needed — all uploads in this plan go through the service-role key, which bypasses Storage RLS.

- [ ] **Step 2: Confirm it exists**

In the dashboard, confirm the `booth-originals` bucket appears in the Storage list and its visibility shows as private/not-public.

---

### Task 2: Add the private-upload step to `gen-house-archive-enrichment.mjs`

**Files:**
- Modify: `scripts/gen-house-archive-enrichment.mjs`

**Interfaces:**
- Consumes: `booth-originals` bucket created in Task 1.
- Produces: nothing consumed by other code — this is the last task in the plan.

- [ ] **Step 1: Read the current image loop**

Open `scripts/gen-house-archive-enrichment.mjs`. The relevant block is lines 11 (imports) and 144-169 (the image loop):

```js
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import sharp from "sharp";
```

```js
let images = 0;
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
  }
}
```

- [ ] **Step 2: Add the Supabase client import and a small `.env` reader**

This script is run as a plain `node scripts/gen-house-archive-enrichment.mjs` — it does not go through Next.js's automatic `.env` loading, so it must read `.env` itself (matching how the equivalent problem was solved elsewhere in this session, not via a new `dotenv` dependency).

Add this import alongside the existing ones at the top of the file:

```js
import { createClient } from "@supabase/supabase-js";
```

Add this helper right after the existing `AUTHORED` constant (after line 30):

```js
/** 이 스크립트는 node로 직접 실행되므로 Next.js의 .env 자동 로드를 못 받는다 — 직접 읽는다. */
function loadSupabaseCreds() {
  const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const get = (name) => text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim();
  return { url: get("NEXT_PUBLIC_SUPABASE_URL"), key: get("SUPABASE_SERVICE_ROLE_KEY") };
}

const ORIGINALS_BUCKET = "booth-originals";
const ORIGINALS_PREFIX = "house-archive-2026";
```

- [ ] **Step 3: Build the Supabase client once, before the image loop, tolerating missing credentials**

Add this immediately before the `let images = 0;` line (before the image loop, so it runs once, not per-file):

```js
const creds = loadSupabaseCreds();
const supabase =
  creds.url && creds.key ? createClient(creds.url, creds.key) : null;
if (!supabase) {
  warn.push("Supabase 자격증명 없음 — 원본 백업 업로드를 건너뜀(크롭·JSON은 계속 진행)");
}
```

- [ ] **Step 4: Upload the original inside the image loop, after the existing crop/webp step**

Insert this right after `images++;` (still inside the `for (const file of readdirSync(IMG_SRC))` loop, before its closing `}`):

```js
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
```

Add the counter it references — put `let originalsUploaded = 0;` on the same line as the existing `let images = 0;` so both counters are declared together:

```js
let images = 0;
let originalsUploaded = 0;
```

- [ ] **Step 5: Report the upload count in the script's final console output**

Find the existing summary logging near the end of the file:

```js
console.log(`이미지 ${images}장 → ${IMG_OUT}`);
```

Add a line right after it:

```js
console.log(`이미지 ${images}장 → ${IMG_OUT}`);
if (supabase) {
  console.log(`원본 백업 ${originalsUploaded}/${images}장 → Supabase '${ORIGINALS_BUCKET}/${ORIGINALS_PREFIX}'`);
}
```

- [ ] **Step 6: Verify the script still produces identical JSON/webp output**

Run:
```bash
node scripts/gen-house-archive-enrichment.mjs
git status --short src/lib/booth/enrichment-house-archive-2026.json public/booths/house-archive/
```
Expected: **no changes reported** by `git status` for either path (this run should be a no-op against already-current source data — proves the new upload code didn't alter the existing crop/JSON logic). If `git status` shows unexpected diffs in the JSON or webp files, stop and investigate before continuing — that would mean Step 2-5's edits broke something in the untouched part of the script.

- [ ] **Step 7: Verify the upload path actually works against the bucket from Task 1**

Run the script again with its console output visible:
```bash
node scripts/gen-house-archive-enrichment.mjs
```
Expected: the new line `원본 백업 <N>/<N>장 → Supabase 'booth-originals/house-archive-2026'` appears with the failure count effectively 0 (i.e. `<N>/<N>` matching, not `<M>/<N>` with `M < N`). If it prints `자격증명 없음`, re-check `.env` has both `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` set. If individual uploads fail, read the printed error — the most likely cause is Task 1's bucket not existing yet or being named differently than `booth-originals`.

In the Supabase dashboard's Storage browser, open the `booth-originals` bucket and confirm it now contains files under a `house-archive-2026/` folder, one per matched source image (e.g. `house-archive-2026/H01.jpg`).

- [ ] **Step 8: Commit**

```bash
git add scripts/gen-house-archive-enrichment.mjs
git commit -m "feat(house-archive): back up crop source images to a private Supabase bucket"
```
