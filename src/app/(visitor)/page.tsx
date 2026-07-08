import Image from "next/image";
import { getRepository } from "@/lib/repositories";
import { ExhibitionCard } from "@/components/exhibition/exhibition-card";
import { EmptyState } from "@/components/common/states";
import { AppOnboardingGate } from "@/components/onboarding/app-onboarding";
import { AccountButton } from "@/components/auth/account-button";
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

      <section className="space-y-1 px-5 pb-2 pt-6">
        <h2 className="text-2xl font-extrabold leading-tight">
          {t("home.headingA")}
          <br />
          {t("home.headingB")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
      </section>

      <section className="space-y-3 px-4 py-4">
        {exhibitions.length === 0 ? (
          <EmptyState
            title={t("home.emptyTitle")}
            description={t("home.emptyDesc")}
          />
        ) : (
          exhibitions.map((ex, i) => (
            // 첫 전시를 로미 추천으로 강조(멀티 전시 대비 — 추후 가치 매칭으로 고도화).
            <ExhibitionCard
              key={ex.id}
              exhibition={ex}
              recommended={i === 0}
              recommendedLabel={t("home.recommended")}
            />
          ))
        )}
      </section>
    </main>
  );
}
