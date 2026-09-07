import { getRepository } from "@/lib/repositories";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";

const SOURCE_LABEL: Record<string, string> = {
  intake: "인입",
  admin: "직접 편집",
  drafter: "자동 초안",
  participant: "참가사 폼",
};

const ENTITY_LABEL: Record<string, string> = {
  booth_enrichment: "부스 저작 정보",
  booth: "부스",
  exhibition: "전시",
  event: "이벤트",
};

function preview(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}

/** 변경 이력. 무엇이 무엇으로 바뀌었는지까지 보여준다 — 되돌릴 근거가 여기 있다. */
export default async function AdminChangesPage() {
  const repo = await getRepository();
  const changes = await repo.listChanges({ limit: 200 });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">변경 이력</h1>
        <p className="text-sm text-muted-foreground">
          누가 어디서 무엇을 무엇으로 바꿨는지. 인입·직접 편집·자동 초안이 모두 같은
          원장에 쌓입니다.
        </p>
      </header>

      {changes.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          아직 기록된 변경이 없습니다.
        </Card>
      ) : (
        <ul className="space-y-3">
          {changes.map((c) => (
            <Card key={c.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Chip>{SOURCE_LABEL[c.source] ?? c.source}</Chip>
                <span className="text-sm font-bold">
                  {ENTITY_LABEL[c.entity] ?? c.entity}
                </span>
                <code className="text-xs text-muted-foreground">
                  {c.entityId}
                </code>
                <span className="ml-auto text-xs text-muted-foreground tabular">
                  {c.createdAt.slice(0, 16).replace("T", " ")}
                </span>
              </div>
              {c.reason && (
                <p className="text-sm text-muted-foreground">{c.reason}</p>
              )}
              <ul className="space-y-2">
                {Object.entries(c.fieldDiffs).map(([field, d]) => (
                  <li key={field} className="text-sm">
                    <p className="font-medium">{field}</p>
                    <p className="text-muted-foreground line-through decoration-destructive/50">
                      {preview(d.before)}
                    </p>
                    <p>{preview(d.after)}</p>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
