// admin "오류 로그" 탭 전용 순수 함수 — journey-funnel.ts/onboardingValueBreakdown과
// 같은 자리, 같은 이유(repo 구현 두 곳에 로직 중복 안 넣음). repo.listIssues()는
// 원본 그대로 반환하고, 호출부(admin 페이지)가 이 groupIssues()로 묶는다.
import type { IssueLog } from "@/lib/types";

const COMPONENT_RULES: [RegExp, string][] = [
  [/^\/(admin|api\/admin)/, "관리자"],
  [/^\/(login|auth|api\/auth)/, "로그인"],
  [/^\/exhibitions\/[^/]+\/map/, "지도"],
  [/^\/(booths|api\/booths)/, "부스 상세"],
  [/^\/(exhibitions|api\/exhibitions)/, "피드/전시홈"],
  [/^\/api\/me/, "컴패니언"],
];

/** 경로 규칙으로 어느 기능(구성요소)에서 난 오류인지 자동 분류한다. 새 입력 없음. */
export function componentOf(path?: string): string {
  if (!path) return "기타";
  return COMPONENT_RULES.find(([re]) => re.test(path))?.[1] ?? "기타";
}

export interface IssueGroup {
  key: string;
  component: string;
  path?: string;
  message: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** 가장 최근 발생 건 — stack/context/device/location/userId 열람용. */
  sample: IssueLog;
}

/** (path, message) 기준으로 묶는다. lastSeenAt 내림차순 정렬. */
export function groupIssues(issues: IssueLog[]): IssueGroup[] {
  const byKey = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = `${issue.path ?? ""}::${issue.message}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        component: componentOf(issue.path),
        path: issue.path,
        message: issue.message,
        count: 1,
        firstSeenAt: issue.createdAt,
        lastSeenAt: issue.createdAt,
        sample: issue,
      });
      continue;
    }
    existing.count += 1;
    if (issue.createdAt < existing.firstSeenAt) existing.firstSeenAt = issue.createdAt;
    if (issue.createdAt > existing.lastSeenAt) {
      existing.lastSeenAt = issue.createdAt;
      existing.sample = issue;
    }
  }
  return [...byKey.values()].sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt),
  );
}
