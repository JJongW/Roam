import Link from "next/link";
import { getRepository } from "@/lib/repositories";
import { articleQueue } from "@/lib/admin/queues";
import { STATUS_LABEL } from "@/lib/articles/decision";
import { KIND_LABEL } from "@/lib/articles/slack";
import { GenerateArticleButton } from "@/components/admin/articles/generate-button";
import type { Article } from "@/lib/types";

export const dynamic = "force-dynamic";

/** 아티클 초안과 결정 목록. 승인 대기가 위. */
export default async function AdminArticlesPage() {
  const repo = await getRepository();
  let rows: Article[] = [];
  let drafts = 0;
  let atLeast = false;
  let loadError = "";
  try {
    // 관리자 홈의 "아티클 승인 대기"와 같은 함수다(lib/admin/queues.ts).
    ({ rows, drafts, atLeast } = await articleQueue(repo));
  } catch (e) {
    // 0070 적용 전이면 여기로 온다. 빈 목록으로 위장하지 않는다.
    loadError = e instanceof Error ? e.message : String(e);
  }
  const order = { draft: 0, approved: 1, rejected: 2 } as const;
  rows.sort((a, b) => order[a.status] - order[b.status] || b.createdAt.localeCompare(a.createdAt));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold">아티클</h1>
        <p className="text-sm text-muted-foreground">
          매일 09:30 점검이 초안 한 편을 만들어 슬랙 보고 아래에 붙여요. 승인한 글만 공개 API에 나가요.
        </p>
        {!loadError && (
          <p className="text-sm">
            승인 대기 <b className="tabular">{drafts}편</b>
            {atLeast && <span className="text-muted-foreground">, 최근 200편까지만 읽었어요</span>}
          </p>
        )}
        <GenerateArticleButton />
      </header>
      {loadError && (
        <p className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive">
          아티클을 읽지 못했어요. 마이그레이션 0070을 적용했는지 확인해 주세요. ({loadError})
        </p>
      )}
      {!loadError && rows.length === 0 && <p className="text-sm text-muted-foreground">아직 초안이 없어요.</p>}
      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {rows.map((a) => (
          <li key={a.id} className="p-4">
            <Link href={`/admin/articles/${a.id}`} className="block space-y-1">
              <p className="text-xs text-muted-foreground">
                {STATUS_LABEL[a.status]}, {KIND_LABEL[a.kind]}, {a.generatedFor}
              </p>
              <p className="font-semibold">{a.title}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{a.excerpt}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
