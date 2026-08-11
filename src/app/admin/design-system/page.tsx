import { AdminSection } from "@/components/admin/section";
import { MotionDemo } from "@/components/admin/design-system/motion-demo";
import { ProgressCircleDemo } from "@/components/admin/design-system/progress-circle-demo";
import { MenuDemo } from "@/components/admin/design-system/menu-demo";

export const metadata = { title: "디자인 시스템" };

const COLORS = [
  { name: "Primary", varName: "--primary" },
  { name: "Primary Foreground", varName: "--primary-foreground" },
  { name: "Secondary", varName: "--secondary" },
  { name: "Secondary Foreground", varName: "--secondary-foreground" },
  { name: "Muted", varName: "--muted" },
  { name: "Muted Foreground", varName: "--muted-foreground" },
  { name: "Accent", varName: "--accent" },
  { name: "Accent Foreground", varName: "--accent-foreground" },
  { name: "Destructive", varName: "--destructive" },
  { name: "Success", varName: "--success" },
  { name: "Warning", varName: "--warning" },
  { name: "Border", varName: "--border" },
  { name: "Route Visited", varName: "--route-visited" },
  { name: "Booth Active", varName: "--booth-active" },
] as const;

const TYPE_STEPS = [
  { name: "text-xs", className: "text-xs", px: "12px", lineHeight: "16px" },
  { name: "text-sm", className: "text-sm", px: "14px", lineHeight: "19px" },
  { name: "text-base", className: "text-base", px: "16px", lineHeight: "22px" },
  { name: "text-lg", className: "text-lg", px: "18px", lineHeight: "24px" },
  { name: "text-xl", className: "text-xl", px: "20px", lineHeight: "27px" },
  { name: "text-2xl", className: "text-2xl", px: "24px", lineHeight: "32px" },
  { name: "text-3xl", className: "text-3xl", px: "28px", lineHeight: "38px" },
] as const;

const WEIGHTS = [
  { name: "Regular", className: "font-normal" },
  { name: "Medium", className: "font-medium" },
  { name: "SemiBold", className: "font-semibold" },
  { name: "Bold", className: "font-bold" },
  { name: "ExtraBold", className: "font-extrabold" },
] as const;

const SPACING_STEPS = [
  { name: "x0.5", varName: "--spacing-x0-5", px: 2 },
  { name: "x1", varName: "--spacing-x1", px: 4 },
  { name: "x1.5", varName: "--spacing-x1-5", px: 6 },
  { name: "x2", varName: "--spacing-x2", px: 8 },
  { name: "x2.5", varName: "--spacing-x2-5", px: 10 },
  { name: "x3", varName: "--spacing-x3", px: 12 },
  { name: "x3.5", varName: "--spacing-x3-5", px: 14 },
  { name: "x4", varName: "--spacing-x4", px: 16 },
  { name: "x4.5", varName: "--spacing-x4-5", px: 18 },
  { name: "x5", varName: "--spacing-x5", px: 20 },
  { name: "x6", varName: "--spacing-x6", px: 24 },
  { name: "x7", varName: "--spacing-x7", px: 28 },
  { name: "x8", varName: "--spacing-x8", px: 32 },
  { name: "x9", varName: "--spacing-x9", px: 36 },
  { name: "x10", varName: "--spacing-x10", px: 40 },
  { name: "x12", varName: "--spacing-x12", px: 48 },
  { name: "x13", varName: "--spacing-x13", px: 52 },
  { name: "x14", varName: "--spacing-x14", px: 56 },
  { name: "x16", varName: "--spacing-x16", px: 64 },
] as const;

const SEMANTIC_SPACING = [
  { name: "global-gutter", px: 16, desc: "화면 좌우 기본 여백" },
  { name: "component-default", px: 12, desc: "컴포넌트 간 기본 세로 간격" },
  { name: "nav-to-title", px: 20, desc: "상단바~타이틀" },
  { name: "screen-bottom", px: 56, desc: "화면 하단 여백" },
  { name: "between-text", px: 6, desc: "텍스트 요소 간" },
  { name: "between-chips", px: 8, desc: "칩 간 가로 간격" },
] as const;

const RADIUS_STEPS = [
  { name: "sm", className: "rounded-sm", px: "8px" },
  { name: "md", className: "rounded-md", px: "12px" },
  { name: "lg", className: "rounded-lg", px: "14px" },
  { name: "xl", className: "rounded-xl", px: "20px" },
  { name: "2xl", className: "rounded-2xl", px: "24px" },
  { name: "full", className: "rounded-full", px: "9999px" },
] as const;

const SHADOW_STEPS = [
  { name: "card", varName: "--shadow-card", label: "평상시 카드 (SEED s1)" },
  {
    name: "sheet",
    varName: "--shadow-sheet",
    label: "바텀시트, 위 방향 (SEED s2 세기)",
  },
  { name: "pop", varName: "--shadow-pop", label: "팝오버·강조 (SEED s3)" },
] as const;

export default function DesignSystemPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">디자인 시스템</h1>
        <p className="text-sm text-muted-foreground">
          Roam이 쓰는 모든 디자인 토큰 — 색은 자체 팔레트,
          나머지(간격·radius·그림자· 모션·타이포)는 SEED 디자인 시스템 값
        </p>
      </header>

      <AdminSection
        title="색(Color)"
        description="Roam 자체 팔레트 — 라이트 모드 기준"
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLORS.map((c) => (
            <div key={c.varName} className="space-y-1.5">
              <div
                className="h-14 rounded-md border border-border"
                style={{ background: `var(${c.varName})` }}
              />
              <p className="text-xs font-semibold">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.varName}</p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="타이포(Typography)"
        description="Pretendard · 400/500/600/700/800 실사용 · SEED t-scale 위계"
      >
        <div className="space-y-4">
          {TYPE_STEPS.map((t) => (
            <div
              key={t.name}
              className="flex items-baseline gap-4 border-b border-border pb-3 last:border-0"
            >
              <div className="w-24 shrink-0 text-xs text-muted-foreground">
                {t.name}
                <br />
                {t.px} / {t.lineHeight}
              </div>
              <div className="flex flex-1 flex-wrap items-baseline gap-4">
                {WEIGHTS.map((w) => (
                  <span
                    key={w.name}
                    className={`${t.className} ${w.className}`}
                  >
                    가나다 Roam 123
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="간격(Spacing)"
        description="원시 스케일 x0.5~x16 + 의미 토큰"
      >
        <div className="space-y-2">
          {SPACING_STEPS.map((s) => (
            <div key={s.varName} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs font-semibold">
                {s.name}
              </span>
              <div
                className="h-3 rounded-sm bg-primary"
                style={{ width: `var(${s.varName})` }}
              />
              <span className="text-xs text-muted-foreground">{s.px}px</span>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          {SEMANTIC_SPACING.map((s) => (
            <div
              key={s.name}
              className="flex items-center justify-between text-xs"
            >
              <span className="font-semibold">{s.name}</span>
              <span className="text-muted-foreground">
                {s.px}px — {s.desc}
              </span>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="Radius"
        description="기존 이름(sm~2xl) 유지, 값만 SEED 스케일"
      >
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {RADIUS_STEPS.map((r) => (
            <div key={r.name} className="space-y-1.5 text-center">
              <div
                className={`mx-auto size-14 border-2 border-primary ${r.className}`}
              />
              <p className="text-xs font-semibold">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.px}</p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="그림자(Shadow)"
        description="card=s1, sheet=s2(방향 유지), pop=s3"
      >
        <div className="grid grid-cols-1 gap-8 py-4 sm:grid-cols-3">
          {SHADOW_STEPS.map((s) => (
            <div key={s.varName} className="space-y-2 text-center">
              <div
                className="mx-auto flex h-20 w-full items-center justify-center rounded-lg bg-card text-xs font-semibold"
                style={{ boxShadow: `var(${s.varName})` }}
              >
                {s.name}
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="모션(Motion)"
        description="duration 6단계 + easing 6종 — 버튼을 눌러 실제로 확인"
      >
        <MotionDemo />
      </AdminSection>

      <AdminSection
        title="Progress Circle"
        description="size 24/40 · determinate/indeterminate · neutral/brand"
      >
        <ProgressCircleDemo />
      </AdminSection>

      <AdminSection
        title="Menu"
        description="아직 실사용처 없음 — 관리자 타임라인에서 쓸 예정, 여기서만 검증"
      >
        <MenuDemo />
      </AdminSection>
    </div>
  );
}
