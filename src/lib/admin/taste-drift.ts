import { VALUE_TAGS } from "@/lib/values";
import { exhibitionValueProfile } from "@/lib/feed/exhibition-match";
import type { BoothListItem, Exhibition, UserSignal } from "@/lib/types";

/**
 * 취향이 시간에 따라 어디로 움직였나 — "굿즈 중심이었는데 점점 발견 쪽으로".
 *
 * 교란이 둘 있고 둘 다 걸러낸다.
 *
 * ⚠️ **① 관객 구성** — 전시마다 오는 사람이 다르면 분포 차이는 취향 변화가 아니라
 * 사람이 바뀐 것이다. → 재방문자(2개 이상 전시에 신호)만 센다.
 *
 * ⚠️ **② 전시 성격** — 도서전은 학습 신호가, 홈 페어는 체험 신호가 많이 나온다.
 * 같은 사람이라도 부스 구성이 다르면 반응 분포가 달라진다. 그건 취향 변화가 아니라
 * 전시 차이다. → 전시가 **제공하는** 가치 분포(부스 valueTags) 대비 얼마나 골랐는지,
 * 즉 **선호 편향**(선택 비중 − 제공 비중)을 잰다. 도서전에서 학습을 많이 고른 건
 * 도서전에 학습이 많아서일 뿐이고, 편향은 그걸 나눠서 없앤다.
 *
 * 개인 단위 추세는 이미 브레인이 갖고 있다(`InterestNode.trend`) — 여기서 재는 건
 * 그 사람들을 합친 전체의 이동이다.
 */

export interface DriftSlice {
  exhibitionId: string;
  exhibitionName: string;
  startDate: string;
  /** 이 전시에서 재방문자들이 남긴 신호 수. */
  signals: number;
  /** 가치 slug → **선호 편향**(선택 비중 − 이 전시가 제공하는 비중). 양수면
   *  "전시에 있는 것보다 더 많이 골랐다". 전시 성격을 나눠낸 값이다. */
  bias: Record<string, number>;
  /** 참고 — 이 전시가 제공한 가치 분포. 부스에 valueTags가 없으면 비어 있고,
   *  그때는 편향을 못 재서 선택 비중을 그대로 쓴다. */
  offered: Record<string, number>;
  /** 부스 저작이 비어 전시 성격을 못 나눈 상태인가. */
  unadjusted: boolean;
}

export interface ValueMove {
  slug: string;
  label: string;
  /** 처음 → 마지막 비중 변화(퍼센트포인트). */
  deltaPct: number;
  fromPct: number;
  toPct: number;
}

export interface TasteDrift {
  slices: DriftSlice[];
  /** 가장 크게 움직인 가치들(절대값 순). */
  movers: ValueMove[];
  /** 재방문자 수. 이 숫자가 작으면 이동은 우연이다. */
  cohort: number;
  note: string | null;
}

/** 이 아래면 이동을 추세로 읽지 않는다. */
const MIN_COHORT = 5;
const MIN_SIGNALS = 20;

const LABEL = Object.fromEntries(VALUE_TAGS.map((v) => [v.slug, v.label]));
const VALUE_SET: ReadonlySet<string> = new Set<string>(
  VALUE_TAGS.map((v) => v.slug),
);

export function tasteDrift(
  bundles: {
    exhibition: Exhibition;
    signals: UserSignal[];
    /** 전시가 제공하는 가치 분포를 내는 재료. 없으면 편향 보정을 못 한다. */
    booths?: BoothListItem[];
  }[],
): TasteDrift {
  // 2개 이상 전시에 신호를 남긴 사용자만 코호트로 잡는다.
  const exhibitionsByUser = new Map<string, Set<string>>();
  for (const b of bundles) {
    for (const s of b.signals) {
      if (!s.userId) continue;
      const seen = exhibitionsByUser.get(s.userId) ?? new Set<string>();
      seen.add(b.exhibition.id);
      exhibitionsByUser.set(s.userId, seen);
    }
  }
  const cohort = new Set(
    [...exhibitionsByUser.entries()]
      .filter(([, seen]) => seen.size > 1)
      .map(([user]) => user),
  );

  const slices: DriftSlice[] = bundles
    .map((b) => {
      const mine = b.signals.filter((s) => cohort.has(s.userId));
      const counts: Record<string, number> = {};
      let total = 0;
      for (const s of mine) {
        for (const slug of s.slugs) {
          // 가치 축만 본다. 분야 slug는 전시마다 namespace가 달라 비교가 안 된다.
          if (!VALUE_SET.has(slug)) continue;
          counts[slug] = (counts[slug] ?? 0) + 1;
          total += 1;
        }
      }
      const chosen: Record<string, number> = {};
      for (const [slug, n] of Object.entries(counts)) chosen[slug] = n / total;
      const offered = b.booths ? exhibitionValueProfile(b.booths) : {};
      const unadjusted = Object.keys(offered).length === 0;
      const bias: Record<string, number> = {};
      for (const slug of new Set([
        ...Object.keys(chosen),
        ...Object.keys(offered),
      ])) {
        // 보정 못 하는 전시(부스 valueTags가 비었다)는 선택 비중을 그대로 둔다 —
        // 0을 빼는 것과 같아 결과는 보정 전과 동일하고, unadjusted로 표시된다.
        bias[slug] = (chosen[slug] ?? 0) - (offered[slug] ?? 0);
      }
      return {
        exhibitionId: b.exhibition.id,
        exhibitionName: b.exhibition.name,
        startDate: b.exhibition.startDate,
        signals: total,
        bias,
        offered,
        unadjusted,
      };
    })
    .filter((s) => s.signals > 0)
    // 시간 순 — 이동은 순서가 있어야 방향이 생긴다.
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  const movers = computeMovers(slices);
  return { slices, movers, cohort: cohort.size, note: noteFor(cohort.size, slices) };
}

function computeMovers(slices: DriftSlice[]): ValueMove[] {
  if (slices.length < 2) return [];
  const first = slices[0];
  const last = slices[slices.length - 1];
  const slugs = new Set([...Object.keys(first.bias), ...Object.keys(last.bias)]);
  return [...slugs]
    .map((slug) => {
      const fromPct = Math.round((first.bias[slug] ?? 0) * 100);
      const toPct = Math.round((last.bias[slug] ?? 0) * 100);
      return { slug, label: LABEL[slug] ?? slug, fromPct, toPct, deltaPct: toPct - fromPct };
    })
    .filter((m) => m.deltaPct !== 0)
    .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 4);
}

function noteFor(cohort: number, slices: DriftSlice[]): string | null {
  if (slices.length < 2) {
    return "두 전시 모두에 신호를 남긴 사용자가 없어 이동을 볼 수 없다.";
  }
  if (cohort < MIN_COHORT) {
    return `재방문자가 ${cohort}명뿐이라 이동은 개인차에 가깝다 — ${MIN_COHORT}명은 모여야 경향으로 읽는다.`;
  }
  const thin = slices.filter((s) => s.signals < MIN_SIGNALS);
  if (thin.length > 0) {
    return `${thin.map((s) => s.exhibitionName).join("·")}의 신호가 ${MIN_SIGNALS}건 미만이라 그 지점은 흔들린다.`;
  }
  const raw = slices.filter((s) => s.unadjusted);
  if (raw.length > 0) {
    return `${raw.map((s) => s.exhibitionName).join("·")}은 부스 가치 태그가 없어 전시 성격을 못 나눴다 — 그 지점의 이동엔 전시 차이가 섞여 있다.`;
  }
  return null;
}
