import { RomiAvatar } from "@/components/v2/romi-avatar";
import { InboxBell } from "@/components/inbox/inbox-bell";
import { MyPageLink } from "@/components/me/my-page-link";
import { LegalLinks } from "@/components/common/legal-links";
import { LanguageSwitch } from "@/components/i18n/language-switch";
import { HomeBody } from "@/components/home/home-body";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/api/session";
import { todayISO } from "@/lib/exhibition/current";
import { groupFairs, homeHeadline } from "@/lib/exhibition/fair-groups";
import { loadFairEntries } from "@/lib/exhibition/fair-entries";
import { homeCopy } from "@/lib/copy/home";

export const metadata = {
  // 홈 title은 동의 화면 앱 이름("Roam")과 정확히 일치해야 한다(Google OAuth 브랜딩
  // 인증). absolute로 "%s | Roam" 템플릿을 우회해 "Roam"만 노출한다.
  title: { absolute: "Roam" },
};

/**
 * UI 20-01 홈(Figma 3230:21580, 11-20 Ted).
 *
 * 머리는 로미와 한 줄("오늘은 한 곳이 열려 있어요" / "다음 박람회는 12월 4일에 열려요"), 아래는 박람회 줄.
 * 박람회를 고르면 바로 지도다(지도 먼저, 브랜드 규칙 §4). 옛 홈의 가치 매치 추천("이런 성향이라 추천")은
 * 지웠다 — 로미는 동행자이고 온보딩 몇 개로 취향을 정하지 않는다(§3, §5).
 *
 * 공개 랜딩이다(proxy.ts). 로그인은 마이페이지에서 기억을 이어 갈 때 권한다.
 */
export default async function HomePage() {
  const [{ t }, user, { entries, fairs, failed }] = await Promise.all([
    getI18n(),
    getCurrentUser(),
    loadFairEntries(),
  ]);
  const today = todayISO();
  const groups = groupFairs(entries, today);

  // 구조화 데이터 — 앱 이름과 목적을 기계가 읽는 표준 경로로도 명시한다. Google OAuth
  // 인증이 "홈페이지의 앱 이름이 동의 화면과 일치하지 않는다"로 반려한 이력이 있어,
  // 화면 텍스트에만 의존하지 않고 여기에도 같은 값을 박아둔다.
  // 이름은 "Roam" 단독 — docs/brand/04_naming-messaging.md §1.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Roam",
    applicationCategory: "TravelApplication",
    operatingSystem: "Web",
    url: "https://roam.ai.kr",
    description: t("home.tagline"),
    inLanguage: ["ko", "en"],
    offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" },
  };

  return (
    <main className="flex flex-1 flex-col bg-v2-bg-layer-default pb-safe font-v2-ui">
      <script
        type="application/ld+json"
        // 값은 위에서 우리가 만든 리터럴이라 사용자 입력이 섞이지 않는다.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header className="flex items-center gap-v2-x2-5 pl-v2-x4 pr-v2-x1-5 pt-safe">
        <div className="flex min-h-v2-x14 flex-1 items-center gap-v2-x2-5">
          <RomiAvatar size="md" />
          <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
            {failed ? homeCopy.homeFailed : homeHeadline(groups)}
          </h1>
        </div>
        {/* 18-01A 알림함 종(로그인한 분만), 마이페이지(웹은 하단 탭 대신 머리에 둔다). */}
        {user && <InboxBell />}
        <MyPageLink />
      </header>

      <div className="flex-1 pb-v2-x10 pt-v2-x4">
        <HomeBody groups={groups} fairs={fairs} today={today} failed={failed} signedIn={!!user} />
      </div>

      {/* 앱 이름과 목적, 개인정보처리방침과 약관 링크 — Google OAuth 인증의 명시 요구사항이다.
          링크가 없으면 심사관에겐 없는 문서와 같다. 언어 전환도 여기. */}
      <footer className="flex flex-col gap-v2-x3 border-t border-v2-stroke-neutral-muted px-v2-x4 py-v2-x6">
        <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{t("home.tagline")}</p>
        <LegalLinks />
        <LanguageSwitch />
      </footer>
    </main>
  );
}
