/**
 * 뼈대 화면(loading.tsx)을 눈으로 확인하려고 서버 렌더를 일부러 늦춘다.
 * `?skeletonDelay=1500`처럼 붙이면 그만큼(최대 10초) 기다린다. 배포본(production)에선 아무것도 안 한다.
 */
export async function devSkeletonDelay(value: string | string[] | undefined): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const ms = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(ms) || ms <= 0) return;
  await new Promise((r) => setTimeout(r, Math.min(ms, 10_000)));
}
