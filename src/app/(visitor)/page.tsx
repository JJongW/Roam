import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { EmptyState } from "@/components/common/states";
import { AccountButton } from "@/components/auth/account-button";
import { LegalLinks } from "@/components/common/legal-links";
import { LanguageSwitch } from "@/components/i18n/language-switch";
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
import { todayISO } from "@/lib/exhibition/current";
import {
  exhibitionStatus,
  pickSeriesRepresentative,
} from "@/lib/exhibition/status";
import { ExhibitionStatusSection } from "@/components/exhibition/exhibition-status-section";

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
  const today = todayISO();
  const byStatus = (status: "upcoming" | "ongoing" | "ended") =>
    exhibitions.filter((ex) => exhibitionStatus(ex, today) === status);

  const ongoing = pickSeriesRepresentative(byStatus("ongoing"), "ongoing");
  const upcoming = pickSeriesRepresentative(byStatus("upcoming"), "upcoming");
  // 지난 전시는 매치 점수·개막일 순서가 의미 없다 — 최근에 끝난 것부터.
  const ended = [...pickSeriesRepresentative(byStatus("ended"), "ended")].sort(
    (a, b) => b.endDate.localeCompare(a.endDate),
  );

  // "추천"은 진행중·예정 중에서만 — 이미 끝난 전시를 취향 근거로 추천하는 건
  // 의미가 없다. ongoing을 upcoming보다 먼저 두어 "지금 갈 수 있는 곳"을 우선한다.
  const top = [...ongoing, ...upcoming][0];
  const topMatch = top ? matchBySlug.get(top.slug) : undefined;
  const topReason = topMatch ? matchReason(topMatch.matched) : null;
  const topReasonText =
    topReason ??
    (ongoing.length + upcoming.length === 1 ? t("home.singleReason") : null);
  const topStatus = top ? exhibitionStatus(top, today) : null;

  // 구조화 데이터 — 앱 이름과 목적을 기계가 읽는 표준 경로로도 명시한다. Google OAuth
  // 인증이 "홈페이지의 앱 이름이 동의 화면과 일치하지 않는다"로 반려한 이력이 있어,
  // 화면 텍스트(h1·소개문)에만 의존하지 않고 여기에도 같은 값을 박아둔다.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Roam",
    alternateName: "Roam — Exhibition Navigator",
    applicationCategory: "TravelApplication",
    operatingSystem: "Web",
    url: "https://roam.ai.kr",
    description: t("home.tagline"),
    inLanguage: ["ko", "en"],
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  };

  return (
    <main className="flex-1 pb-safe">
      <script
        type="application/ld+json"
        // 값은 위에서 우리가 만든 리터럴이라 사용자 입력이 섞이지 않는다.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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

      <section className="space-y-5 px-[var(--spacing-global-gutter)] pb-6 pt-2">
        {exhibitions.length === 0 ? (
          <EmptyState
            title={t("home.emptyTitle")}
            description={t("home.emptyDesc")}
          />
        ) : (
          <>
            <ExhibitionStatusSection
              title={t("home.statusOngoing")}
              exhibitions={ongoing}
              recommendedSlug={top?.slug}
              recommendedLabel={t("home.recommended")}
              showBadge={topReason !== null}
              recommendedReason={topStatus === "ongoing" ? topReasonText : null}
            />
            <ExhibitionStatusSection
              title={t("home.statusUpcoming")}
              exhibitions={upcoming}
              recommendedSlug={top?.slug}
              recommendedLabel={t("home.recommended")}
              showBadge={topReason !== null}
              recommendedReason={
                topStatus === "upcoming" ? topReasonText : null
              }
            />
            <ExhibitionStatusSection
              title={t("home.statusEnded")}
              exhibitions={ended}
            />
          </>
        )}
      </section>

      {/* 홈에서 개인정보처리방침·약관으로 가는 길 — Google OAuth 인증의 명시
          요구사항이다. 링크가 없으면 심사관에겐 없는 문서와 같다. 언어 전환도 여기 —
          예전엔 첫 진입에 전체화면 게이트로 물었는데 그게 홈페이지를 가렸다. */}
      <footer className="space-y-3 border-t border-border px-[var(--spacing-global-gutter)] py-6">
        <LegalLinks />
        <LanguageSwitch />
      </footer>
    </main>
  );
}
