import type { Dict } from "@/lib/i18n/dictionaries";

type Params = Record<string, string | number>;

// 사전은 2단계(namespace → 평면 키). 첫 점에서만 분리하므로 키에 점이 있어도 OK
// (예: onboardingQ["app1.a"]). 없으면 키 그대로 반환(폴백/디버깅 가시성).
// 값이 배열이면 카피 다양성용 변주 풀 — 매번 무작위로 하나를 고른다(로미가 매번
// 똑같은 문장만 반복하면 캐릭터가 아니라 알림처럼 느껴진다).
function getPath(obj: unknown, path: string): string {
  const dot = path.indexOf(".");
  if (dot === -1) return path;
  const ns = path.slice(0, dot);
  const key = path.slice(dot + 1);
  if (obj && typeof obj === "object" && ns in obj) {
    const nsObj = (obj as Record<string, unknown>)[ns];
    if (nsObj && typeof nsObj === "object" && key in nsObj) {
      const v = (nsObj as Record<string, unknown>)[key];
      if (typeof v === "string") return v;
      if (Array.isArray(v) && v.length > 0) {
        return v[Math.floor(Math.random() * v.length)] as string;
      }
    }
  }
  return path;
}

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}

export type TFn = (path: string, params?: Params) => string;

/** 사전으로 t 함수를 만든다. t("home.headingA"), t("recap.visited", {n: 3}). */
export function makeT(dict: Dict): TFn {
  return (path, params) => interpolate(getPath(dict, path), params);
}
