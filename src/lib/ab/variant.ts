// 웹의 A/B 나누기. 웹에는 배정 서버가 없어 기기(브라우저) 단위로 고정한다.
//
// - 씨앗은 기록에 쓰는 기기 id(`roam.device.id`, app-track.ts)다. 같은 브라우저는 늘 같은 쪽을 본다.
// - 한 번 정한 값은 `roam.ab.<key>`에 남긴다. 나눔 비율을 나중에 바꿔도 이미 본 사람은 그대로다.
// - 저장소를 못 쓰면(사생활 보호 창 등) 그 자리에서 씨앗을 새로 만들어 고른다. 기록이 화면을 막지 않는다.
// - 어느 쪽을 봤는지는 이벤트 props.variant에 싣는다(iOS와 같은 칸).

const ANON_KEY = "roam.device.id";

/** 문자열 → 0 이상 정수(FNV-1a 32비트). 고르게 퍼지기만 하면 된다. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 씨앗과 실험 이름으로 한쪽을 고른다. 같은 씨앗, 같은 이름이면 늘 같은 값. */
export function pickVariant<T extends string>(
  seed: string,
  key: string,
  variants: readonly T[],
): T {
  return variants[hash32(`${key}:${seed}`) % variants.length];
}

function deviceSeed(): string {
  try {
    const hit = window.localStorage.getItem(ANON_KEY);
    if (hit) return hit;
    const id = crypto.randomUUID();
    window.localStorage.setItem(ANON_KEY, id);
    return id;
  } catch {
    return String(Math.random());
  }
}

/** 이 브라우저가 볼 쪽. 브라우저에서만 부른다(서버 렌더에선 첫 값을 돌려준다). */
export function abVariant<T extends string>(key: string, variants: readonly T[]): T {
  if (typeof window === "undefined") return variants[0];
  const storeKey = `roam.ab.${key}`;
  try {
    const saved = window.localStorage.getItem(storeKey) as T | null;
    if (saved && variants.includes(saved)) return saved;
  } catch {
    // 저장소를 못 쓰면 아래에서 고르기만 한다.
  }
  const v = pickVariant(deviceSeed(), key, variants);
  try {
    window.localStorage.setItem(storeKey, v);
  } catch {
    // 남기지 못해도 씨앗이 같으면 같은 값이 나온다.
  }
  return v;
}

/** 실험 목록. 키 이름은 iOS와 같다(`roam.ab.<key>`). */
export const AB = {
  /** 11-01 H-B(홈에 지난주 다녀오신 박람회 줄) / 11-02 H-C(박람회 전체에서만). 11-11 Ted: 반응으로 고른다. */
  endedFairEntry: { key: "endedFairEntry", variants: ["h_b", "h_c"] as const },
  /** 5-03 로그인 제안 위치 위 / 아래. Ted는 위를 선호, 로그인 탭 비율로 고른다. */
  loginPromptPosition: { key: "loginPromptPosition", variants: ["top", "bottom"] as const },
} as const;
