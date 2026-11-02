import { CalendarClock, Archive } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { getI18n } from "@/lib/i18n/server";
import {
  daysUntilStart,
  type ExhibitionStatusKind,
} from "@/lib/exhibition/status";

/**
 * 전시가 **지금 열려 있지 않을 때** 그 사실을 먼저 말하는 띠.
 *
 * 이게 없던 동안 아직 안 열린 전시의 홈도 열린 전시와 똑같이 보였다 — 혼잡도
 * 지도와 "오늘 관람 마치기"까지. 현장에서만 뜻이 있는 것들이 날짜와 무관하게
 * 떠 있으면 사용자는 자기가 뭘 잘못 본 건지 의심한다.
 *
 * 열려 있는(ongoing) 동안엔 아무것도 그리지 않는다 — 정상 상태를 설명하는 띠는
 * 화면만 차지한다.
 */
export async function ExhibitionStatusNotice({
  status,
  startDate,
  endDate,
  todayISO,
}: {
  status: ExhibitionStatusKind;
  startDate: string;
  endDate: string;
  todayISO: string;
}) {
  if (status === "ongoing") return null;
  const { locale, t } = await getI18n();
  const upcoming = status === "upcoming";
  const dateLocale = locale === "ko" ? ko : undefined;
  const date = format(
    new Date(upcoming ? startDate : endDate),
    locale === "ko" ? "M월 d일" : "MMM d",
    { locale: dateLocale },
  );
  const dday = daysUntilStart(startDate, todayISO);

  return (
    <section className="flex items-start gap-3 rounded-2xl border border-border bg-secondary/60 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-background">
        {upcoming ? (
          <CalendarClock className="size-[1.1rem] text-muted-foreground" aria-hidden />
        ) : (
          <Archive className="size-[1.1rem] text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <p className="font-bold">{t(upcoming ? "exStatus.upcoming" : "exStatus.ended")}</p>
          {upcoming && dday > 0 && (
            <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground">
              {t("exStatus.dday", { n: dday })}
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t(upcoming ? "exStatus.upcomingDesc" : "exStatus.endedDesc", { date })}
        </p>
      </div>
    </section>
  );
}
