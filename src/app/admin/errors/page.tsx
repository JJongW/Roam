import { getRepository } from "@/lib/repositories";
import { getAdminFairScope } from "@/lib/admin/fair-scope";
import { AdminFairHeader } from "@/components/admin/admin-fair-header";
import { dataIssueQueue, issueGroups } from "@/lib/admin/queues";
import { AdminSection } from "@/components/admin/section";
import { IssueLogList } from "@/components/admin/issue-log-list";
import { DataIssueList } from "@/components/admin/data-issue-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "오류/이슈" };

type Props = { searchParams: Promise<{ tab?: string }> };

export default async function AdminErrorsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const repo = await getRepository();
  const { exhibitions, exhibition } = await getAdminFairScope();

  // 관리자 홈의 "오류"와 "데이터 이슈"와 같은 함수다(lib/admin/queues.ts).
  const groups = await issueGroups(repo);
  const data = exhibition ? await dataIssueQueue(repo, exhibition.id) : { gaps: [], inconsistencies: [], count: 0 };
  const { gaps, inconsistencies } = data;

  return (
    <div className="space-y-5">
      <AdminFairHeader
        title="오류/이슈"
        exhibitions={exhibitions}
        exhibition={exhibition}
        description="오류 로그는 모든 행사를 모아 보고, 데이터 이슈만 고른 행사 기준으로 봐요."
      />

      <Tabs defaultValue={tab === "data" ? "data" : "logs"}>
        <TabsList>
          <TabsTrigger value="logs">오류 로그 {groups.length}</TabsTrigger>
          <TabsTrigger value="data">데이터 이슈 {data.count}</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <AdminSection
            title="오류 로그"
            description={`묶어서 ${groups.length}건, 최근 30일`}
          >
            <IssueLogList groups={groups} />
          </AdminSection>
        </TabsContent>
        <TabsContent value="data">
          <AdminSection title="데이터 이슈" description={`빈 필수 칸 ${gaps.length}곳, 기록 어긋남 ${inconsistencies.length}건, 조회 시점 실시간 계산`}>
            <DataIssueList gaps={gaps} inconsistencies={inconsistencies} />
          </AdminSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
