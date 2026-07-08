import type { Dict } from "@/lib/i18n/dictionaries";

type Params = Record<string, string | number>;

function getPath(obj: unknown, path: string): string {
  let cur: unknown = obj;
  for (const seg of path.split(".")) {
    if (cur && typeof cur === "object" && seg in cur) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return path; // 없으면 키 그대로(폴백/디버깅 가시성).
    }
  }
  return typeof cur === "string" ? cur : path;
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
