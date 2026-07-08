import Image from "next/image";
import { getRepository } from "@/lib/repositories";
import { ExhibitionCard } from "@/components/exhibition/exhibition-card";
import { EmptyState } from "@/components/common/states";
import { AppOnboardingGate } from "@/components/onboarding/app-onboarding";

export const metadata = {
  title: "전시 둘러보기",
};

export default async function HomePage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 20 });

  return (
    <main className="flex-1 pb-safe">
      <AppOnboardingGate />
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 pt-safe backdrop-blur-xl">
        <span className="flex items-center gap-1.5 text-lg font-extrabold tracking-tight">
          <span className="flex size-7 items-center justify-center overflow-hidden rounded-full ring-1 ring-border">
            <Image
              src="/logo.svg"
              alt="Roam 로고"
              width={28}
              height={28}
              className="size-full object-cover"
              unoptimized
              priority
            />
          </span>
          Roam
        </span>
      </header>

      <section className="space-y-1 px-5 pb-2 pt-6">
        <h2 className="text-2xl font-extrabold leading-tight">
          어떤 전시부터
          <br />
          둘러볼까?
        </h2>
        <p className="text-sm text-muted-foreground">
          너한테 의미 있을 부스를 골라 보여줄게. 관심 가는 곳부터 같이 둘러보자.
        </p>
      </section>

      <section className="space-y-3 px-4 py-4">
        {exhibitions.length === 0 ? (
          <EmptyState
            title="아직 열린 전시가 없어"
            description="곧 새 전시가 열리면 같이 보러 가자."
          />
        ) : (
          exhibitions.map((ex) => (
            <ExhibitionCard key={ex.id} exhibition={ex} />
          ))
        )}
      </section>
    </main>
  );
}
