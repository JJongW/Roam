import Link from "next/link";
import { Check, ChevronRight, Circle, HelpCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { FairPortfolioLink } from "@/components/admin/fair-portfolio-link";
import type { UpcomingFair } from "@/lib/admin/today";
import { cn } from "@/lib/utils";

function dday(n: number): string {
  return n === 0 ? "오늘 시작" : `${n}일 뒤`;
}

/**
 * 됨(체크), 아직(빈 원), 모름(물음표). 모르는 것을 됨이나 아직으로 보이지 않는다.
 * 아이콘은 같은 크기 상자(size-3.5)에 넣는다. 빈 원만 작게 그리면 글자 시작이 줄마다 어긋난다(2026-11-28 Ted).
 */
function Mark({ ok, label }: { ok: boolean | null; label: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-1", ok ? "text-foreground" : "text-muted-foreground")}>
      <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
        {ok === null ? (
          <HelpCircle className="size-3.5" />
        ) : ok ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Circle className="size-3 text-muted-foreground/60" />
        )}
      </span>
      <span className="sr-only">{ok === null ? "모름 " : ok ? "있음 " : "없음 "}</span>
      <span className="truncate" title={label}>
        {label}
      </span>
    </span>
  );
}

function Row({ fair }: { fair: UpcomingFair }) {
  const ready = fair.next === "ready";
  const brands =
    fair.brands === null ? "브랜드 모름" : fair.brands.fromFile ? `파일 기준 브랜드 ${fair.brands.count}` : `브랜드 ${fair.brands.count}`;
  const body = (
    <>
      <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] md:items-center md:gap-4">
        <div className="min-w-0">
          <p className="truncate font-bold">{fair.name}</p>
          <p className="text-xs text-muted-foreground tabular">
            {fair.startDate} ~ {fair.endDate}
          </p>
        </div>
        <p className="mt-1 text-xs font-semibold text-muted-foreground tabular md:mt-0 md:text-sm">{dday(fair.daysUntil)}</p>
        {/* 2열 그리드. 열 폭이 줄과 박람회 사이에서 같아야 둘째 칸(배치도, 부스) 시작이 맞는다.
            그래서 바깥 그리드의 마지막 열도 auto(알약 글자 길이)가 아니라 비율이다. */}
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs md:mt-0 tabular">
          <Mark ok={fair.registered} label="행사 등록" />
          <Mark ok={fair.floorplan} label="배치도" />
          <Mark ok={fair.brands === null ? null : fair.brands.count > 0 && !fair.brands.fromFile} label={brands} />
          <Mark ok={fair.booths > 0} label={`부스 ${fair.booths}`} />
        </div>
        <div className="mt-2 md:mt-0 md:justify-self-end">
          <Chip size="sm" variant={ready ? "outline" : "tint"}>
            {fair.note}
          </Chip>
        </div>
      </div>
      <ChevronRight className="size-4 shrink-0 self-center text-muted-foreground" aria-hidden />
    </>
  );
  const cls = "press -mx-2 flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-secondary active:bg-card-pressed";
  // 운영에 있는 박람회는 고른 채 분석으로 간다(포트폴리오와 같은 길). 아직 없는 박람회는 인입 화면으로.
  return fair.id ? (
    <FairPortfolioLink exhibitionId={fair.id} className={cls}>
      {body}
    </FairPortfolioLink>
  ) : (
    <Link href="/admin/intake" className={cls}>
      {body}
    </Link>
  );
}

export function UpcomingFairs({ fairs, windowDays }: { fairs: UpcomingFair[]; windowDays: number }) {
  return (
    <section className="space-y-3" aria-labelledby="upcoming-fairs-title">
      <div>
        <h2 id="upcoming-fairs-title" className="text-lg font-extrabold">
          다가오는 박람회
        </h2>
        <p className="text-sm text-muted-foreground">
          {windowDays}일 안에 시작하는 박람회예요. 아직 만들지 않은 박람회는 레포 파일에서 읽어요.
        </p>
      </div>
      <Card className="px-4 py-1">
        {fairs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{windowDays}일 안에 시작하는 박람회가 없어요.</p>
        ) : (
          <ul className="divide-y divide-border">
            {fairs.map((f) => (
              <li key={f.slug}>
                <Row fair={f} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
