/**
 * Roam 워커 — 맥미니에서 도는 배치 실행기(설계 문서 §4).
 *
 * 왜 별도 프로세스인가: 초안기 실측이 10부스 49초다. Vercel 함수 상한(기본 60초)에
 * 이미 닿았고 SIF 914부스는 75분이라 라우트로는 불가능하다. 오래 도는 일만 여기로
 * 옮긴다 — **하루 멈춰도 사용자에게 아무 일 없는 것**만(§4 원칙).
 *
 * 왜 K8s가 아닌가: 서비스는 Vercel 하나이고 나머지는 배치다. 컨트롤 플레인을
 * 얹으면 장애 표면만 는다. Compose의 restart 정책이면 충분하다.
 */
import os from "node:os";
import { config as loadEnv } from "dotenv";
// Next가 아니라 맨 Node라 .env를 직접 읽어야 한다. repositories가 env를 읽기 전에
// 해야 하므로 import 순서가 의미를 갖는다.
loadEnv();
import { getRepository } from "@/lib/repositories";
import { runDraftBatch } from "@/lib/enrichment/run-draft";
import type { Job } from "@/lib/types";

const WORKER = `${os.hostname()}:${process.pid}`;
/** 큐가 비었을 때 쉬는 시간. 잡이 하루 수십 건이라 촘촘히 돌 이유가 없다. */
const IDLE_MS = Number(process.env.WORKER_IDLE_MS ?? 5000);
/** 이 워커가 집는 잡 종류. 비우면 전부. 종류별로 컨테이너를 나눌 때 쓴다. */
const TYPES = (process.env.WORKER_TYPES ?? "").split(",").filter(Boolean);

type Handler = (
  job: Job,
  ctx: { repo: Awaited<ReturnType<typeof getRepository>> },
) => Promise<Record<string, unknown>>;

/** 잡 종류 → 실행기. 새 워커는 여기 한 줄이다. */
const HANDLERS: Record<string, Handler> = {
  async enrichment_draft(job, { repo }) {
    const p = job.payload as {
      exhibitionSlug: string;
      codes?: string[];
      limit?: number;
      actor?: string | null;
    };
    const result = await runDraftBatch(repo, {
      exhibitionSlug: p.exhibitionSlug,
      codes: p.codes,
      limit: p.limit ?? 10,
      actor: p.actor ?? null,
      // 진행이 안 보이면 오래 도는 잡이 살아 있는지 알 수 없다.
      onProgress: (prog) => repo.updateJobProgress(job.id, prog),
    });
    if ("error" in result) throw new Error(result.error);
    return result as unknown as Record<string, unknown>;
  },
};

/** 한 잡만 처리하고 나간다. 배포 전 손으로 확인할 때 쓴다. */
const ONCE = process.env.WORKER_ONCE === "1";

let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  // 집어둔 잡을 끝내고 나간다. 중간에 죽으면 requeue_stale_jobs가 회수한다.
  process.on(sig, () => {
    log("종료 신호 — 현재 잡을 마치고 멈춥니다");
    stopping = true;
  });
}

function log(msg: string, extra?: Record<string, unknown>) {
  const line = { t: new Date().toISOString(), worker: WORKER, msg, ...extra };
  console.log(JSON.stringify(line));
}

async function tick(): Promise<boolean> {
  const repo = await getRepository();
  const job = await repo.claimJob(WORKER, TYPES.length ? TYPES : undefined);
  if (!job) return false;

  const handler = HANDLERS[job.type];
  if (!handler) {
    // 모르는 종류를 조용히 버리면 큐에 영원히 남는다. 실패로 남겨 사람이 본다.
    await repo.finishJob(job.id, {
      ok: false,
      error: `처리기가 없는 잡 종류: ${job.type}`,
    });
    log("모르는 잡 종류", { jobId: job.id, type: job.type });
    return true;
  }

  log("잡 시작", { jobId: job.id, type: job.type, attempt: job.attempts });
  const started = Date.now();
  try {
    const result = await handler(job, { repo });
    await repo.finishJob(job.id, { ok: true, result });
    log("잡 완료", { jobId: job.id, ms: Date.now() - started });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // 지수 백오프 — 같은 실패를 즉시 반복하면 요금만 나간다.
    const retryAfterMs = Math.min(15 * 60_000, 2 ** job.attempts * 30_000);
    await repo.finishJob(job.id, { ok: false, error, retryAfterMs });
    log("잡 실패", { jobId: job.id, error, retryAfterMs });
  }
  return true;
}

async function main() {
  log("워커 시작", { types: TYPES.length ? TYPES : "all", idleMs: IDLE_MS });
  while (!stopping) {
    let worked = false;
    try {
      worked = await tick();
    } catch (e) {
      // 큐 자체가 안 되는 상황(네트워크·인증). 죽지 말고 쉬었다 다시 — 맥미니는
      // 집 컴퓨터라 네트워크가 끊겼다 돌아오는 게 정상 상황이다.
      log("루프 오류", { error: e instanceof Error ? e.message : String(e) });
    }
    if (ONCE) {
      log(worked ? "잡 하나 처리하고 종료(WORKER_ONCE)" : "큐가 비어 종료(WORKER_ONCE)");
      break;
    }
    if (!worked) await new Promise((r) => setTimeout(r, IDLE_MS));
  }
  log("워커 종료");
}

void main();
