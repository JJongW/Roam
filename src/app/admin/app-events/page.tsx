import { getRepository } from "@/lib/repositories";
import { AdminSection } from "@/components/admin/section";
import { summarizeAppEvents } from "@/lib/analytics/app-events";

export const metadata = { title: "앱 이벤트" };
export const dynamic = "force-dynamic";

/** 한 번에 읽는 줄 수. 넘으면 화면에 "최근 N개만 셌어요"라고 밝힌다. */
const LIMIT = 20000;
const DAY = 24 * 60 * 60 * 1000;
const sinceIso = (days: number, now = new Date()) => new Date(now.getTime() - days * DAY).toISOString();

type Props = { searchParams: Promise<{ days?: string }> };

/**
 * iOS(앞으로 Android)가 보내는 이름 붙은 이벤트(0066, 화면 설계서 E 2-4)가 들어오는지 보는 화면.
 * 박람회 단위 "분석"은 박람회가 있는 이벤트만 보여 줘서, 홈이나 설정 이벤트와 "들어오기는 하나"를 못 본다.
 * 속성(props)은 읽지 않는다 — 수와 시각만.
 */
export default async function AdminAppEventsPage({ searchParams }: Props) {
  const { days: raw } = await searchParams;
  const days = [1, 7, 30].includes(Number(raw)) ? Number(raw) : 7;
  const since = sinceIso(days);
  const repo = await getRepository();
  const rows = await repo.listAppEventsSince(since, LIMIT);
  const s = summarizeAppEvents(rows);
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" }) : "없음";

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">앱 이벤트</h1>
        <p className="text-sm text-muted-foreground">
          앱이 보낸 이벤트 수예요. 지난 {days}일 기준이고, 속성 내용은 보여 주지 않아요.
        </p>
        <div className="flex gap-3 text-sm">
          {[1, 7, 30].map((d) => (
            <a key={d} href={`/admin/app-events?days=${d}`} className={d === days ? "font-bold" : "text-muted-foreground"}>
              {d}일
            </a>
          ))}
        </div>
      </div>

      <AdminSection title="한눈에">
        <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><dt className="text-muted-foreground">이벤트</dt><dd className="text-lg font-bold">{s.total}</dd></div>
          <div><dt className="text-muted-foreground">설치(익명 id)</dt><dd className="text-lg font-bold">{s.installs}</dd></div>
          <div><dt className="text-muted-foreground">마지막으로 받은 때</dt><dd className="font-medium">{fmt(s.lastAt)}</dd></div>
          <div>
            <dt className="text-muted-foreground">플랫폼</dt>
            <dd className="font-medium">{s.byPlatform.map((p) => `${p.platform} ${p.count}`).join(", ") || "없음"}</dd>
          </div>
        </dl>
        {rows.length >= LIMIT && <p className="mt-2 text-xs text-muted-foreground">최근 {LIMIT}개만 셌어요.</p>}
      </AdminSection>

      <AdminSection title="앱 버전별">
        <table className="w-full text-sm">
          <thead className="text-left text-muted-foreground">
            <tr><th>플랫폼</th><th>버전</th><th className="text-right">수</th><th className="text-right">마지막</th></tr>
          </thead>
          <tbody>
            {s.byVersion.map((v) => (
              <tr key={`${v.platform}-${v.appVersion}`}>
                <td>{v.platform}</td><td>{v.appVersion}</td><td className="text-right">{v.count}</td><td className="text-right">{fmt(v.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminSection>

      <AdminSection title="이벤트 이름별">
        {s.byName.length === 0 ? (
          <p className="text-sm text-muted-foreground">이 기간에 받은 앱 이벤트가 없어요.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr><th>이름</th><th className="text-right">수</th><th className="text-right">마지막</th></tr>
            </thead>
            <tbody>
              {s.byName.map((n) => (
                <tr key={n.name}>
                  <td className="font-mono">{n.name}</td><td className="text-right">{n.count}</td><td className="text-right">{fmt(n.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminSection>
    </div>
  );
}
