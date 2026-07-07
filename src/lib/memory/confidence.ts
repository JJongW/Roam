// L4 메모리 — 관심 confidence 수학. 순수·결정론, I/O 없음, LLM 없음.
// 신호 가중합에 시간감쇠를 적용하고 포화 정규화한다.
import { SIGNAL_WEIGHTS } from "@/lib/constants";
import type { SignalKind, UserSignal } from "@/lib/types";
import { clamp } from "@/lib/utils";

const DAY_MS = 86_400_000;

export interface ConfidenceTuning {
  halfLifeDays: number;
  /** 포화 상수: confidence = raw / (raw + K). 클수록 완만. */
  K: number;
}

/** 지수 시간감쇠. Δt=반감기이면 0.5. 미래/음수 Δt는 1로 클램프. */
export function decay(deltaMs: number, halfLifeMs: number): number {
  if (halfLifeMs <= 0) return 1;
  const d = deltaMs <= 0 ? 0 : deltaMs;
  return Math.pow(0.5, d / halfLifeMs);
}

export function normalize(n: number): number {
  return clamp(n, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp(t, 0, 1);
}

export type SignalDimension = "explicit" | "implicit" | "negative";

/** 신호 종류를 대표 차원으로 분류 (InterestNode.signals 카운트용). */
export function dimensionOf(kind: SignalKind): SignalDimension {
  const w = SIGNAL_WEIGHTS[kind];
  if (w.negative > 0) return "negative";
  return w.explicit >= w.implicit ? "explicit" : "implicit";
}

export interface ConfidenceResult {
  confidence: number;
  signals: { explicit: number; implicit: number; negative: number };
}

/** 한 slug에 속한 신호들 → confidence(0..1) + 차원별 카운트. */
export function computeConfidence(
  signals: UserSignal[],
  nowMs: number,
  tuning: ConfidenceTuning,
): ConfidenceResult {
  const halfLifeMs = tuning.halfLifeDays * DAY_MS;
  let raw = 0;
  const counts = { explicit: 0, implicit: 0, negative: 0 };
  for (const sig of signals) {
    const w = SIGNAL_WEIGHTS[sig.kind];
    const d = decay(nowMs - Date.parse(sig.createdAt), halfLifeMs);
    raw += (w.explicit + w.implicit - w.negative) * d;
    counts[dimensionOf(sig.kind)] += 1;
  }
  const confidence = raw <= 0 ? 0 : normalize(raw / (raw + tuning.K));
  return { confidence, signals: counts };
}

/** 최근 신호가 과거보다 강하면 up, 약하면 down (감쇠 가중, 절반 시점 기준). */
export function trendOf(
  signals: UserSignal[],
  nowMs: number,
  halfLifeDays: number,
): "up" | "flat" | "down" {
  if (signals.length < 2) return "flat";
  const halfLifeMs = halfLifeDays * DAY_MS;
  const times = signals.map((s) => Date.parse(s.createdAt));
  const min = Math.min(...times);
  const max = Math.max(...times);
  // 같은 세션(1분 이내)에 몰린 신호는 추세로 볼 수 없다 — 노이즈.
  if (max - min < 60_000) return "flat";
  const mid = min + (max - min) / 2;
  let early = 0;
  let late = 0;
  for (const s of signals) {
    const t = Date.parse(s.createdAt);
    const w = SIGNAL_WEIGHTS[s.kind];
    const val =
      (w.explicit + w.implicit - w.negative) * decay(nowMs - t, halfLifeMs);
    if (t >= mid) late += val;
    else early += val;
  }
  if (late > early * 1.2) return "up";
  if (late < early * 0.8) return "down";
  return "flat";
}
