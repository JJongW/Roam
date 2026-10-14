/**
 * 인스타 캐러셀 게시 CLI — `npm run ig:publish -- --dir <폴더> --caption <캡션.txt> [--publish]`.
 *
 * 기본은 드라이런(이미지·캡션 검사만). `--check`는 업로드와 캐러셀 준비(FINISHED)까지만
 * 실제로 하고 게시하지 않는다. `--publish`를 붙여야 Supabase Storage 공개 버킷
 * `ig-publish`에 올리고 Graph API로 게시한다. 결정 근거:
 * docs/decisions/2026-10-14_instagram-auto-publish.md
 *
 * 토큰은 env(IG_ACCESS_TOKEN, 없으면 META_TOKEN)에서만 읽고 출력하지 않는다.
 */
import { readdir, readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { createClient } from "@supabase/supabase-js";
import { prepareCarousel, publishCarousel, type PublishConfig } from "@/lib/instagram/publish";
import { runPublishCli } from "@/lib/instagram/publish-cli";

// Next 밖이라 .env를 직접 읽는다(없으면 조용히 넘어간다 — 드라이런은 env가 필요 없다).
try {
  process.loadEnvFile();
} catch {
  /* .env 없음 */
}

const BUCKET = "ig-publish";

function need(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name}가 설정되지 않았습니다 (.env 또는 셸 환경변수)`);
  return value;
}

let bucketReady = false;

async function upload(key: string, bytes: Uint8Array): Promise<string> {
  const supabase = createClient(
    need("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    need("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
  if (!bucketReady) {
    // Graph API가 가져가야 하므로 공개 버킷이다. 이미 있으면 그대로 쓴다.
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`버킷 생성 실패: ${error.message}`);
    bucketReady = true;
  }
  const { error } = await supabase.storage.from(BUCKET).upload(key, bytes, { contentType: "image/jpeg", upsert: true });
  if (error) throw new Error(`업로드 실패 ${key}: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(key).data.publicUrl;
}

function graphConfig(): PublishConfig {
  return {
    token: need("IG_ACCESS_TOKEN", process.env.IG_ACCESS_TOKEN ?? process.env.META_TOKEN),
    igUserId: need("IG_USER_ID", process.env.IG_USER_ID),
    version: process.env.IG_GRAPH_VERSION,
    log: (l) => console.log(`  ${l}`),
  };
}

const code = await runPublishCli(process.argv.slice(2), {
  listDir: (dir) => readdir(dir),
  readFile: async (p) => new Uint8Array(await readFile(p)),
  readText: (p) => readFile(p, "utf8"),
  upload,
  publish: (input) => publishCarousel(input, graphConfig()),
  prepare: (input) => prepareCarousel(input, graphConfig()),
  confirm: async (q) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(q);
    rl.close();
    return /^y(es)?$/i.test(answer.trim());
  },
  out: (l) => console.log(l),
  today: () => new Date().toISOString().slice(0, 10),
}).catch((e: unknown) => {
  console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
  return 1;
});
process.exit(code);
