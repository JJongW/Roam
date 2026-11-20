import { CompanionBar } from "@/components/companion/companion-bar";

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
      {/* 옛 전체 화면 온보딩(AppOnboardingGate)은 지웠다. 지도를 가리고 질문 몇 개로 취향을 정했다(브랜드
          규칙 §3, §4와 어긋남). 첫 진입은 박람회 지도 위 사진 고르기(UI 1, map-v2/fair-map-screen.tsx)다. */}
    </div>
  );
}
