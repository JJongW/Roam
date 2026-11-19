/**
 * 운영 DB 말투 스크립트(`roam-voice-db-backfill.ts`, `roam-voice-review-19.ts`)가 같이 쓰는 도구.
 * 자격증명은 값을 읽기만 하고 출력하지 않는다.
 */
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { voiceIssues } from "@/lib/booth/roam-voice";

/** worktree에서 돌리면 .env가 없으니 본 체크아웃(git common dir의 부모)의 .env를 쓴다. 값은 읽기만 한다. */
export function findEnvPath(root: string): string {
  const local = join(root, ".env");
  if (existsSync(local)) return local;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const main = join(dirname(common), ".env");
  if (existsSync(main)) return main;
  throw new Error(".env를 찾지 못했어요(이 체크아웃과 본 체크아웃 모두)");
}

/** vite-node로 돌아 Next.js의 .env 자동 로드를 못 받는다. 값은 출력하지 않는다. */
export function loadSupabaseCreds(root: string): { url: string; key: string } {
  const text = readFileSync(findEnvPath(root), "utf8");
  const get = (name: string) =>
    text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error(".env에 Supabase URL 또는 서비스 키가 없어요");
  return { url, key };
}

/** jsonb는 객체 키 순서를 바꿔 돌려준다. 키를 정렬해 비교한다(배열 순서는 본다). */
export const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
        )
      : v;
export const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));

/** 값(문자열, 배열, jsonb 객체) 안의 문자열을 모두 꺼낸다. */
export function stringsIn(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(stringsIn);
  if (v && typeof v === "object") return Object.values(v).flatMap(stringsIn);
  return [];
}

/**
 * 고친 값에 남으면 안 되는 것: 가운뎃점, 반말과 합니다체(`voiceIssues`), 검색 인용 찌꺼기.
 * null은 문제없음(빈 칸). 내용 검사(`contentFlags`의 못 찾았다는 문장)는 보지 않는다. 사람이 보고
 * 남기기로 한 문장("알 수 없었던 청나라 황실의 술")이 걸리기 때문이다.
 */
export function voiceProblems(v: unknown): string[] {
  return stringsIn(v).flatMap((s) => [
    ...(s.includes("·") ? [`가운뎃점: ${s}`] : []),
    ...voiceIssues(s).map((x) => `${x}: ${s}`),
    ...(/\[cite/i.test(s) ? [`[cite]: ${s}`] : []),
  ]);
}
