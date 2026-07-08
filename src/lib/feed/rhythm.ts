// 오늘의 관람 관점(리듬) — 같은 브레인이라도 오늘 어떻게 볼지에 따라 피드 밀도·믹스를
// 바꾼다. 동선(경로)이 아니라 발견의 결. companion-reframe Phase H.

export type Rhythm = "focus" | "light" | "rest";

export const RHYTHMS: {
  key: Rhythm;
  label: string;
  hint: string;
}[] = [
  { key: "focus", label: "집중", hint: "확실한 곳 깊게" },
  { key: "light", label: "가볍게", hint: "골고루 발견" },
  { key: "rest", label: "쉬면서", hint: "적게, 여유롭게" },
];

export const DEFAULT_RHYTHM: Rhythm = "light";

export function isRhythm(v: string | undefined): v is Rhythm {
  return v === "focus" || v === "light" || v === "rest";
}

/** 리듬별 피드 믹스 — 안정(취향 확실)·낯선(인접)·모험(미접촉 가치). */
export const RHYTHM_MIX: Record<
  Rhythm,
  { stable: number; unfamiliar: number; adventure: number }
> = {
  // 집중: 확실한 취향에 깊게, 무작위 최소.
  focus: { stable: 4, unfamiliar: 1, adventure: 0 },
  // 가볍게: 균형 잡힌 발견(기본).
  light: { stable: 3, unfamiliar: 2, adventure: 1 },
  // 쉬면서: 적게, 대신 한 번의 낯선 스파크는 남긴다.
  rest: { stable: 2, unfamiliar: 1, adventure: 1 },
};

export function rhythmLabel(r: Rhythm): string {
  return RHYTHMS.find((x) => x.key === r)?.label ?? r;
}
