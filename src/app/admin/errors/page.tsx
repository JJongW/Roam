import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import {
  findBoothEnrichmentGaps,
  findNoteInconsistencies,
} from "@/lib/admin/data-issues";
import { groupIssues } from "@/lib/admin/issue-grouping";
import { AdminSection } from "@/components/admin/section";
import { IssueLogList } from "@/components/admin/issue-log-list";
import { DataIssueList } from "@/components/admin/data-issue-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "오류/이슈" };

export default async function AdminErrorsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());

  const issues = await repo.listIssues({ limit: 1000, sinceDays: 30 });
  const groups = groupIssues(issues);

  let gaps: ReturnType<typeof findBoothEnrichmentGaps> = [];
  let inconsistencies: ReturnType<typeof findNoteInconsistencies> = [];
  if (exhibition) {
    const booths = await repo.listBoothsByExhibitionId(exhibition.id);
    const boothIds = booths.map((b) => b.id);
    const notes = await repo.listNotesByBoothIds(boothIds);
    gaps = findBoothEnrichmentGaps(booths);
    inconsistencies = findNoteInconsistencies(notes);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">오류/이슈</h1>
        {exhibition && (
          <p className="text-sm text-muted-foreground">{exhibition.name}</p>
        )}
      </header>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">오류 로그</TabsTrigger>
          <TabsTrigger value="data">데이터 이슈</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <AdminSection
            title="오류 로그"
            description={`묶어서 ${groups.length}건 · 최근 30일`}
          >
            <IssueLogList groups={groups} />
          </AdminSection>
        </TabsContent>
        <TabsContent value="data">
          <AdminSection title="데이터 이슈" description="조회 시점 실시간 계산">
            <DataIssueList gaps={gaps} inconsistencies={inconsistencies} />
          </AdminSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
