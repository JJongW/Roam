/**
 * 검수 적체 점검 — launchd(kr.roam.sweep)가 하루 한 번 부른다. 집계는
 * `@/lib/admin/backlog`에 있고 여기는 실행·발송만 한다(worker/index.ts와 같은 모양).
 *
 * 왜 잡 큐(enqueueJob)가 아닌가: 자기 재예약 체인은 한 번 실패하면 조용히
 * 끊기는데, 끊긴 걸 알려주는 게 바로 이 점검이다. 자기가 감시할 대상 위에
 * 올라타면 안 된다. launchd는 맥미니가 꺼져 있던 일정을 깨어날 때 한 번
 * 돌려주므로 집 컴퓨터에 맞는 쪽이기도 하다.
 */
import { config as loadEnv } from "dotenv";
// 맨 Node라 .env를 직접 읽는다. repositories가 env를 읽기 전이어야 해서
// import 순서가 의미를 갖는다(worker/index.ts와 같은 이유).
loadEnv();
// 저장소가 요청 쿠키 대신 서비스 롤을 쓰게 한다 — 점검엔 요청이 없다.
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";
import { collectBacklog, formatBacklog, DEFAULT_STALE_DAYS } from "@/lib/admin/backlog";

const STALE_DAYS = Number(process.env.SWEEP_STALE_DAYS ?? DEFAULT_STALE_DAYS);
const HOOK = process.env.SLACK_WEBHOOK_URL;

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));
}

async function main() {
  const repo = await getRepository();
  const backlog = await collectBacklog(repo, { staleDays: STALE_DAYS });
  log("점검 완료", { ...backlog });

  const text = formatBacklog(backlog, process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (!text) {
    log("적체 없음 — 보내지 않음");
    return;
  }
  console.log(text);

  // 훅이 없어도 점검은 돈다 — 설정 전에 로그로 먼저 확인할 수 있게.
  if (!HOOK) {
    log("SLACK_WEBHOOK_URL 없음 — 로그까지만");
    return;
  }
  const res = await fetch(HOOK, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error(`슬랙 ${res.status} ${await res.text()}`);
  log("슬랙 발송");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
