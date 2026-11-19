/**
 * 검수 적체 점검 + 아티클 초안 — launchd(kr.roam.sweep)가 하루 한 번(09:30) 부른다.
 * 집계는 `@/lib/admin/backlog`, 아티클은 `@/lib/articles/*`에 있고 여기는 실행·발송만 한다.
 *
 * 순서: ① 오늘의 아티클 초안을 만든다(하루 한 편, draft만, 공개 안 함) ② 적체를 센다
 * ③ 적체 보고 아래에 승인 대기 초안을 붙여 슬랙으로 보낸다. 적체가 없어도 승인 대기 초안이
 * 있으면 보낸다(2026-11-19 Ted: "슬랙에 지금 이미 보고하고 있는 내용 하단에 포함시켜서 매일").
 * 초안 만들기가 실패해도 적체 보고는 나간다.
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
import { generateDailyArticle, generationNote, type GenerateResult } from "@/lib/articles/generate";
import { articleLlmWriter } from "@/lib/articles/llm";
import { composeDailyReport, formatArticleSection, heroImage, slackPayload } from "@/lib/articles/slack";
import type { Article } from "@/lib/types";

const STALE_DAYS = Number(process.env.SWEEP_STALE_DAYS ?? DEFAULT_STALE_DAYS);
const HOOK = process.env.SLACK_WEBHOOK_URL;

function log(msg: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...extra }));
}

/** ARTICLE_DAILY=0이면 초안을 만들지 않는다(보고는 그대로). */
const ARTICLE_DAILY = process.env.ARTICLE_DAILY !== "0";

async function draftArticle(repo: Awaited<ReturnType<typeof getRepository>>): Promise<string | null> {
  if (!ARTICLE_DAILY) return null;
  try {
    const r: GenerateResult = await generateDailyArticle(repo, { llm: articleLlmWriter() });
    log("아티클 초안", {
      status: r.status,
      ...(r.status === "created" ? { id: r.article.id, subject: r.article.subjectKey, writer: r.article.gate.writer } : {}),
      ...(r.status === "gate-failed" ? { attempts: r.attempts } : {}),
    });
    // 고를 주제가 없는 날은 조용히 — 그것만으로 매일 알림이 오면 소음이 된다.
    return r.status === "no-subject" ? null : generationNote(r);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("아티클 초안 실패", { error: message });
    return generationNote({ status: "error", message });
  }
}

async function main() {
  const repo = await getRepository();
  const note = await draftArticle(repo);

  const backlog = await collectBacklog(repo, { staleDays: STALE_DAYS });
  log("점검 완료", { ...backlog });

  let drafts: Article[] = [];
  if (ARTICLE_DAILY) {
    try {
      drafts = await repo.listArticles({ status: ["draft"], limit: 20 });
    } catch (e) {
      log("아티클 조회 실패", { error: e instanceof Error ? e.message : String(e) });
    }
  }

  // 슬랙은 폰에서 연다 — 링크는 운영 주소여야 한다. NEXT_PUBLIC_APP_URL은 맥미니에선
  // 로컬 개발 주소(localhost:3000)라 그대로 쓰면 눌러도 안 열렸다(2026-10-09).
  const appUrl = process.env.SLACK_LINK_BASE_URL ?? "https://roam.ai.kr";
  const text = composeDailyReport(
    formatBacklog(backlog, appUrl),
    formatArticleSection({ drafts, note }, { appUrl, linkSecret: process.env.ARTICLE_LINK_SECRET || undefined }),
  );
  if (!text) {
    log("적체도 승인 대기 초안도 없음 — 보내지 않음");
    return;
  }
  console.log(text);

  // 훅이 없어도 점검은 돈다 — 설정 전에 로그로 먼저 확인할 수 있게.
  if (!HOOK) {
    log("SLACK_WEBHOOK_URL 없음 — 로그까지만");
    return;
  }
  const post = (body: Record<string, unknown>) =>
    fetch(HOOK, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  // 버튼은 슬랙 앱 인터랙티브를 켰을 때만(SLACK_ARTICLE_BUTTONS=1). 아니면 서명 링크만.
  const buttonsFor = process.env.SLACK_ARTICLE_BUTTONS === "1" ? drafts[0] : null;
  let res = await post(slackPayload(text, { buttonsFor, image: heroImage(drafts[0], appUrl) }));
  if (!res.ok && drafts[0]) {
    // 슬랙이 대표 사진을 못 받으면(invalid_blocks 등) 메시지 전체가 거절된다. 보고는 빠지면 안 되니 사진 없이 다시.
    log("슬랙 사진 블록 거절 — 사진 없이 다시", { status: res.status, body: (await res.text()).slice(0, 200) });
    res = await post(slackPayload(text, { buttonsFor }));
  }
  if (!res.ok) throw new Error(`슬랙 ${res.status} ${await res.text()}`);
  log("슬랙 발송");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
