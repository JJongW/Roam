/**
 * 부스 상세에서 지도로 갈 때(4-07 지도에서 보기, 4-02 길 안내) 화면을 쌓지 않는다.
 *
 * 예전에는 늘 `router.replace(지도?booth=)`였다. 지도 → 부스 카드 → 자세히로 들어온 상세면 기록이
 * [지도, 지도?booth=]가 되어, 지도에서 뒤로를 누르면 같은 지도가 한 번 더 나왔다.
 * 바로 앞이 그 박람회 지도면 한 칸 뒤로 간 뒤 그 자리를 `지도?booth=`로 바꾼다. 기록에 지도는 하나만 남는다.
 * 앞이 다른 화면(마이페이지, 부스 목록, 다른 상세)이거나 링크로 바로 들어왔으면 예전처럼 상세 자리를 지도로 바꾼다.
 */

/** 바로 앞 화면이 이 박람회 지도인지(쿼리는 보지 않는다). */
export function cameFromMap(previousPathname: string | null, exhibitionSlug: string): boolean {
  return previousPathname === `/exhibitions/${exhibitionSlug}/map`;
}

interface MinimalRouter {
  back: () => void;
  replace: (href: string) => void;
}

export function openMapWithoutStacking(
  router: MinimalRouter,
  href: string,
  opts: { fromMap: boolean },
) {
  if (!opts.fromMap) {
    router.replace(href);
    return;
  }
  // 뒤로가 끝나 지도 자리로 돌아온 뒤에 그 자리를 바꾼다. 앱 라우터도 popstate를 듣는데 먼저 붙어 있어 먼저 돈다.
  window.addEventListener("popstate", () => router.replace(href), { once: true });
  router.back();
}
