import { IntakeUploader } from "@/components/admin/intake-uploader";
import { AdminSection } from "@/components/admin/section";
import { getRepository } from "@/lib/repositories";
import { todayISO } from "@/lib/exhibition/current";
import { FILE_KIND_LABEL, intakeQueue, type IntakeQueueItem } from "@/lib/intake/queue";

export default async function AdminIntakePage() {
  const repo = await getRepository();
  // 관리자 홈의 "인입 대기"와 같은 함수다(lib/intake/queue.ts).
  let items: IntakeQueueItem[] | null = null;
  let loadError = "";
  try {
    items = await intakeQueue(repo, { today: todayISO() });
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">인입</h1>
        <p className="text-sm text-muted-foreground">
          정규형 파일 하나로 부스와 저작 정보를 넣어요. 있는 부스는 빈 칸만
          채우고, 사람이 쓴 값은 건드리지 않아요. 브랜드 파일(brands.v1)은 부스
          없이 브랜드부터 넣어요.
        </p>
      </header>

      <AdminSection
        title={`올릴 파일 ${items?.length ?? 0}`}
        description="끝나지 않은 박람회의 레포 파일 중 올리면 바뀌는 것이에요. 끝난 박람회 파일은 세지 않아요."
      >
        {loadError || items === null ? (
          <p className="text-sm text-destructive">
            레포 파일이나 운영 값을 읽지 못했어요{loadError ? ` (${loadError})` : ""}.
          </p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">지금 올릴 파일이 없어요.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((i) => (
              <li key={i.path} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {i.fairName} <span className="text-sm font-normal text-muted-foreground">{FILE_KIND_LABEL[i.kind]}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{i.path}</p>
                </div>
                <p className="text-sm">{i.change}</p>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>

      <IntakeUploader />
    </div>
  );
}
