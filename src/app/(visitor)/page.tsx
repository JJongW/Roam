import Image from "next/image";
import { getRepository } from "@/lib/repositories";
import { ExhibitionCard } from "@/components/exhibition/exhibition-card";
import { EmptyState } from "@/components/common/states";
import { AppOnboardingGate } from "@/components/onboarding/app-onboarding";
import { AccountButton } from "@/components/auth/account-button";
import { RoamMotion } from "@/components/companion/roam-motion";
import { getI18n } from "@/lib/i18n/server";

export const metadata = {
  title: "Roam",
};

export default async function HomePage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 20 });
  const { t } = await getI18n();

  return (
    <main className="flex-1 pb-safe">
      <AppOnboardingGate />
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 pt-safe backdrop-blur-xl">
        <span className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight">
          <span className="flex size-7 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
            <Image
              src="/logo.svg"
              alt="Roam"
              width={28}
              height={28}
              className="size-full object-cover"
              unoptimized
              priority
            />
          </span>
          Roam
        </span>
        <AccountButton />
      </header>

      {/* Romi 히어로 — 냅다 전시가 아니라 로미가 먼저 맞이한다. */}
      <section className="flex flex-col items-center gap-4 px-6 pb-4 pt-12 text-center">
        <span className="flex size-32 items-center justify-center overflow-hidden rounded-[2.5rem]">
          <RoamMotion src="/walking.mp4" />
        </span>
        <h2 className="text-2xl font-extrabold leading-snug">
          {t("home.heroGreeting")}
        </h2>
        <p className="max-w-[18rem] text-[15px] leading-relaxed text-muted-foreground">
          {t("home.subtitle")}
        </p>
      </section>

      <section className="space-y-3 px-4 pb-6 pt-2">
        {exhibitions.length > 0 && (
          <h3 className="px-1 text-sm font-bold text-muted-foreground">
            {t("home.listHeading")}
          </h3>
        )}
        {exhibitions.length === 0 ? (
          <EmptyState
            title={t("home.emptyTitle")}
            description={t("home.emptyDesc")}
          />
        ) : (
          exhibitions.map((ex, i) => (
            // 첫 전시를 로미 추천으로 강조(멀티 전시 대비 — 추후 가치 매칭으로 고도화).
            <div key={ex.id} className="space-y-1.5">
              <ExhibitionCard
                exhibition={ex}
                recommended={i === 0}
                recommendedLabel={t("home.recommended")}
              />
              {/* 추천 근거 한 줄 — 결정론 템플릿(LLM 없음)이라 Gemini 실패에도 살아있다.
                  전시가 하나뿐이면 솔직하게, 여럿이면 취향 기준으로. 데이터 지어내지 않음. */}
              {i === 0 && (
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                  {exhibitions.length === 1
                    ? t("home.singleReason")
                    : t("home.recommendedReason")}
                </p>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
