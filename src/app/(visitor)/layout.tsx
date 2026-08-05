import { CompanionBar } from "@/components/companion/companion-bar";
import { AppOnboardingGate } from "@/components/onboarding/app-onboarding";

export default function VisitorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      id="main"
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background"
    >
      {children}
      <CompanionBar />
      {/* 홈뿐 아니라 전시·지도·부스 상세 등 모든 방문객 화면 공통 — 공유 링크로
          전시에 바로 들어와도(홈을 안 거쳐도) 필요하면 뜬다. */}
      <AppOnboardingGate />
    </div>
  );
}
