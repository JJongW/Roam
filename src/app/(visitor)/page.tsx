import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { ExhibitionCard } from "@/components/exhibition/exhibition-card";
import { EmptyState } from "@/components/common/states";
import { AccountButton } from "@/components/auth/account-button";
import { RoamMotion } from "@/components/companion/roam-motion";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/api/session";
import {
  byStartDate,
  exhibitionValueProfile,
  matchExhibition,
  matchReason,
  type ExhibitionMatch,
} from "@/lib/feed/exhibition-match";

export const metadata = {
  // absolute — 레이아웃의 "%s · Roam" 템플릿에 "Roam"을 넣으면 "Roam · Roam"이 된다.
  title: { absolute: "Roam — Exhibition Navigator" },
};

export default async function HomePage() {
  const repo = await getRepository();
  const { data: rawExhibitions } = await repo.listExhibitions({ limit: 20 });
  const { t } = await getI18n();
  // 홈은 공개 랜딩 — 로그인 없이도 열린 전시를 둘러본다(proxy.ts). 미로그인 시
  // '왜 로그인?' 배너로 기억·연속성을 설명(계정 벽이 아니라 기억 설정).
  const user = await getCurrentUser();

  // 전시 정렬 — 예전엔 저장소가 준 순서(운영은 id 오름차순)를 그대로 쓰면서 첫 전시에
  // "네가 고른 관람 성향을 기준으로" 라는 문장을 붙였다. 정렬에 취향이 안 들어갔으므로
  // 거짓이었다. 이제 실제로 겹치는 가치가 있을 때만 추천이라 부른다.
  //
  // 부스를 읽어야 전시의 가치 프로필이 나오는데(카테고리엔 전시 링크가 없다),
  // 그 비용은 값어치가 있을 때만 낸다 — 로그인 + 브레인 관심이 있을 때만.
  const brain = user ? await repo.getUserBrain(user.id) : null;
  const hasInterest = (brain?.interests.length ?? 0) > 0;

  let exhibitions = byStartDate(rawExhibitions);
  let matchBySlug = new Map<string, ExhibitionMatch>();
  if (hasInterest) {
    const matches = await Promise.all(
      rawExhibitions.map(async (ex) => {
        const booths = await repo.listBoothsByExhibitionId(ex.id);
        return [
          ex.slug,
          matchExhibition(brain, exhibitionValueProfile(booths)),
        ] as const;
      }),
    );
    matchBySlug = new Map(matches);
    // 겹침이 있는 전시를 점수 순으로 앞에, 나머지는 개막 임박 순으로 뒤에.
    const scored = (ex: (typeof rawExhibitions)[number]) =>
      matchBySlug.get(ex.slug)?.score ?? 0;
    exhibitions = [...rawExhibitions].sort(
      (a, b) => scored(b) - scored(a) || a.startDate.localeCompare(b.startDate),
    );
  }
  // 첫 전시를 "추천"이라 부를 수 있는 건 실제로 겹친 가치가 있을 때뿐이다.
  const top = exhibitions[0];
  const topMatch = top ? matchBySlug.get(top.slug) : undefined;
  const topReason = topMatch ? matchReason(topMatch.matched) : null;

  return (
    <main className="flex-1 pb-safe">
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-[var(--spacing-global-gutter)] pt-safe backdrop-blur-xl">
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

      {/* Romi 히어로 — 냅다 전시가 아니라 로미가 먼저 맞이한다.
          미로그인일 땐 인사말 대신 **앱 이름과 목적**을 세운다: 처음 온 사람(그리고
          Google OAuth 심사관·크롤러)에게는 "어떤 전시부터 볼까?"가 이 앱이 뭔지 알려주지
          않는다. 로그인한 사람에겐 그 소개가 매번 소음이므로 원래 인사말을 유지한다. */}
      <section className="flex flex-col items-center gap-4 px-6 pb-4 pt-12 text-center">
        <span className="flex size-32 items-center justify-center overflow-hidden rounded-[2.5rem]">
          <RoamMotion src="/headbunting.webm" />
        </span>
        {user ? (
          <>
            <h1 className="text-2xl font-extrabold leading-snug">
              {t("home.heroGreeting")}
            </h1>
            <p className="max-w-[18rem] text-[15px] leading-relaxed text-muted-foreground">
              {t("home.subtitle")}
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[2rem] font-extrabold leading-none tracking-tight">
              Roam
            </h1>
            <p className="max-w-[20rem] text-[15px] leading-relaxed text-muted-foreground">
              {t("home.tagline")}
            </p>
          </>
        )}
      </section>

      {/* 미로그인 랜딩 배너 — 계정 벽이 아니라 기억 설정임을 설명 + 로그인 진입. */}
      {!user && (
        <div className="px-[var(--spacing-global-gutter)] pb-2">
          <Link
            href="/login?next=%2F"
            className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 active:scale-[0.99]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-primary">
                {t("home.loginReasonTitle")}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {t("home.loginReasonBody")}
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-primary" />
          </Link>
        </div>
      )}

      <section className="space-y-3 px-[var(--spacing-global-gutter)] pb-6 pt-2">
        {exhibitions.length > 0 && (
          <h2 className="px-1 text-sm font-bold text-muted-foreground">
            {t("home.listHeading")}
          </h2>
        )}
        {exhibitions.length === 0 ? (
          <EmptyState
            title={t("home.emptyTitle")}
            description={t("home.emptyDesc")}
          />
        ) : (
          exhibitions.map((ex, i) => (
            <div key={ex.id} className="space-y-1.5">
              {/* "로미 추천"은 겹친 가치가 실제로 있을 때만 — 근거 없이 주장하지 않는다. */}
              <ExhibitionCard
                exhibition={ex}
                recommended={i === 0 && topReason !== null}
                recommendedLabel={t("home.recommended")}
              />
              {/* 근거 한 줄 — 결정론(LLM 없음). 겹친 가치를 그대로 말하고, 겹침이 없으면
                  아무 말도 하지 않는다. 전시가 하나뿐일 때만 그 사실을 솔직히 알린다. */}
              {i === 0 && (topReason || exhibitions.length === 1) && (
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                  {topReason ?? t("home.singleReason")}
                </p>
              )}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
